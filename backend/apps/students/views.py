# D:\AttendSure_V3\backend\apps\students\views.py

from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.school.selectors import get_sections_for_user
from common.audit import AuditedModelViewSet, record_audit_log
from common.permissions import IsLeadershipOrReadOnly, IsSchoolLeader
from .models import Enrollment
from .selectors import get_parent_portal_data, get_signed_qr_cards, get_students_for_user
from .serializers import EnrollmentSerializer, StudentSerializer
from .services import bulk_import_students_csv


class StudentViewSet(AuditedModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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
            male=Count("id", filter=Q(is_active=True, sex="Male"), distinct=True),
            female=Count("id", filter=Q(is_active=True, sex="Female"), distinct=True),
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

        return Response({
            "total_students": active,
            "total": total,
            "active": active,
            "paired": agg["paired"] or 0,
            "total_sections": total_sections,
            "male": agg["male"] or 0,
            "female": agg["female"] or 0,
            "enrolled": enrolled,
            "unassigned": max(0, active - enrolled),
        })

    @action(detail=False, methods=["get"], url_path="dropdown")
    def dropdown(self, request):
        qs = self.get_queryset().filter(is_active=True).only(
            "id", "lrn", "first_name", "middle_name", "last_name", "suffix", "sex"
        )[:500]
        return Response([
            {
                "id": st.id,
                "lrn": st.lrn,
                "first_name": st.first_name,
                "last_name": st.last_name,
                "full_name": st.full_name,
                "sex": st.sex,
            }
            for st in qs
        ])

    @action(detail=False, methods=["get"], url_path="qr-cards")
    def qr_cards(self, request):
        sec_id = request.query_params.get("section_id")
        cards = get_signed_qr_cards(
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
            request=request,
        )
        return Response({"cards": cards, "total": len(cards)})

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk-import",
        permission_classes=[permissions.IsAuthenticated, IsSchoolLeader],
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
    queryset = Enrollment.objects.select_related("student", "section", "school_year").order_by("-id")
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class ParentPortalView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(get_parent_portal_data(user=request.user, request=request))