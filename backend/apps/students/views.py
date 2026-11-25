from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.selectors import resolve_teacher_for_user
from apps.school.models import Section
from apps.school.selectors import get_sections_for_user
from common.audit import AuditedModelViewSet, record_audit_log
from common.permissions import IsAdminOrPrincipal, IsTeacherOrLeader, is_admin_or_principal
from .models import Enrollment
from .selectors import get_enrollments_for_user, get_signed_qr_cards, get_students_for_user
from .serializers import EnrollmentSerializer, StudentSerializer
from .services import bulk_import_students_csv


def _get_advised_section_ids(user) -> set[int]:
    teacher = resolve_teacher_for_user(user)
    if not teacher or not teacher.can_handle_classes:
        return set()
    return set(Section.objects.filter(adviser=teacher, is_active=True).values_list("id", flat=True))


class StudentViewSet(AuditedModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _assert_can_write_student(self, request, instance=None):
        if is_admin_or_principal(request.user):
            return
        if request.method == "DELETE":
            self.permission_denied(
                request,
                message="Only System Administrators or School Principals can delete learner records.",
            )
        advised_ids = _get_advised_section_ids(request.user)
        if not advised_ids:
            self.permission_denied(
                request,
                message="Only System Administrators, School Principals, or the section's Homeroom Adviser can modify learner records.",
            )
        raw_sec = request.data.get("section_id")
        req_sec_id = int(raw_sec) if (raw_sec and str(raw_sec).isdigit()) else None

        if instance is None:
            if not req_sec_id or req_sec_id not in advised_ids:
                self.permission_denied(
                    request,
                    message="Homeroom advisers can only add learners to their own advised section.",
                )
            return

        current_enr = (
            Enrollment.objects.filter(student=instance)
            .select_related("section__school_year")
            .order_by("-section__school_year__is_active", "-id")
            .first()
        )
        if not current_enr or current_enr.section_id not in advised_ids:
            self.permission_denied(
                request,
                message="You can only edit learners enrolled in your own advised homeroom section.",
            )
        if req_sec_id and req_sec_id not in advised_ids:
            self.permission_denied(
                request,
                message="Homeroom advisers cannot transfer learners to another adviser's section.",
            )

    def create(self, request, *args, **kwargs):
        self._assert_can_write_student(request, instance=None)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._assert_can_write_student(request, instance=self.get_object())
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._assert_can_write_student(request, instance=self.get_object())
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._assert_can_write_student(request, instance=self.get_object())
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        sec_id = self.request.query_params.get("section_id") or self.request.query_params.get("section")
        return get_students_for_user(
            user=self.request.user,
            search=self.request.query_params.get("search", "").strip(),
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
        )

    @action(detail=False, methods=["get"], url_path="metrics")
    def metrics(self, request):
        base_qs = self.get_queryset()
        agg = base_qs.aggregate(
            total=Count("id", distinct=True),
            active=Count("id", filter=Q(is_active=True), distinct=True),
            male=Count("id", filter=Q(is_active=True, gender="Male"), distinct=True),
            female=Count("id", filter=Q(is_active=True, gender="Female"), distinct=True),
            enrolled=Count("id", filter=Q(is_active=True, enrollments__status="ENROLLED"), distinct=True),
            paired=Count(
                "id",
                filter=Q(is_active=True, qr_token__isnull=False) & ~Q(qr_token=""),
                distinct=True,
            ),
        )
        total = agg["total"] or 0
        active = agg["active"] or 0
        enrolled = agg["enrolled"] or 0
        total_sections = get_sections_for_user(request.user).count()

        return Response(
            {
                "total_students": active,
                "total": total,
                "active": active,
                "paired": agg["paired"] or 0,
                "total_sections": total_sections,
                "male": agg["male"] or 0,
                "female": agg["female"] or 0,
                "enrolled": enrolled,
                "unassigned": max(0, active - enrolled),
            }
        )

    @action(detail=False, methods=["get"], url_path="dropdown")
    def dropdown(self, request):
        qs = (
            self.get_queryset()
            .select_related(None)
            .prefetch_related(None)
            .filter(is_active=True)
            .only("id", "lrn", "first_name", "middle_name", "last_name", "suffix", "gender")[:500]
        )
        return Response(
            [
                {
                    "id": st.id,
                    "lrn": st.lrn,
                    "first_name": st.first_name,
                    "last_name": st.last_name,
                    "full_name": st.full_name,
                    "gender": st.gender,
                    "sex": st.gender,
                }
                for st in qs
            ]
        )

    @action(detail=False, methods=["get"], url_path="qr-cards")
    def qr_cards(self, request):
        sec_id = request.query_params.get("section_id")
        cards = get_signed_qr_cards(
            user=request.user,
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
            request=request,
        )
        return Response({"cards": cards, "total": len(cards)})

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk-import",
        permission_classes=[permissions.IsAuthenticated, IsAdminOrPrincipal],
        parser_classes=[MultiPartParser, FormParser],
    )
    def bulk_import(self, request):
        uploaded_file = request.FILES.get("file") or request.FILES.get("csv_file")
        raw_section_id = request.data.get("section_id")
        default_sec_id = int(raw_section_id) if (raw_section_id and str(raw_section_id).isdigit()) else None
        auto_create = str(request.data.get("auto_create_sections", "true")).strip().lower() in (
            "1",
            "true",
            "yes",
        )

        summary = bulk_import_students_csv(
            uploaded_file=uploaded_file,
            default_section_id=default_sec_id,
            auto_create_sections=auto_create,
            actor=request.user,
        )
        record_audit_log(
            request=request,
            table_name="students",
            record_id=0,
            action="IMPORT",
            new_data={
                "created": summary["created_count"],
                "updated": summary["updated_count"],
                "skipped": summary["skipped_count"],
            },
        )
        return Response(summary, status=status.HTTP_200_OK)


class EnrollmentViewSet(AuditedModelViewSet):
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def _assert_can_write_enrollment(self, request, instance=None):
        if is_admin_or_principal(request.user):
            return
        if request.method == "DELETE":
            self.permission_denied(
                request,
                message="Only System Administrators or School Principals can delete enrollments.",
            )
        advised_ids = _get_advised_section_ids(request.user)
        raw_sec = request.data.get("section")
        target_sec = int(raw_sec) if (raw_sec and str(raw_sec).isdigit()) else (instance.section_id if instance else None)
        if not advised_ids or not target_sec or target_sec not in advised_ids:
            self.permission_denied(
                request,
                message="Only System Administrators, School Principals, or the section's Homeroom Adviser can modify enrollments.",
            )

    def create(self, request, *args, **kwargs):
        self._assert_can_write_enrollment(request, instance=None)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._assert_can_write_enrollment(request, instance=self.get_object())
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._assert_can_write_enrollment(request, instance=self.get_object())
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._assert_can_write_enrollment(request, instance=self.get_object())
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        sec_id = self.request.query_params.get("section_id") or self.request.query_params.get("section")
        return get_enrollments_for_user(
            user=self.request.user,
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
        )
