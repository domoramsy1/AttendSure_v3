from django.db.models import Count, Q
from rest_framework import permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from common.audit import AuditedModelViewSet
from common.permissions import IsLeadershipOrReadOnly
from .models import Enrollment
from .selectors import get_parent_portal_data, get_signed_qr_cards, get_students_for_user
from .serializers import EnrollmentSerializer, StudentSerializer


class StudentViewSet(AuditedModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get_queryset(self):
        sec_id = self.request.query_params.get("section_id") or self.request.query_params.get("section")
        return get_students_for_user(
            user=self.request.user,
            search=self.request.query_params.get("search", "").strip(),
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
        )

    @action(detail=False, methods=["get"], url_path="metrics")
    def metrics(self, request):
        qs = self.get_queryset().filter(is_active=True)
        agg = qs.aggregate(
            total=Count("id", distinct=True),
            male=Count("id", filter=Q(sex="Male"), distinct=True),
            female=Count("id", filter=Q(sex="Female"), distinct=True),
            enrolled=Count("id", filter=Q(enrollments__status="ENROLLED"), distinct=True),
        )
        total = agg["total"] or 0
        enrolled = agg["enrolled"] or 0
        return Response({
            "total_students": total,
            "total": total,
            "male": agg["male"] or 0,
            "female": agg["female"] or 0,
            "enrolled": enrolled,
            "unassigned": max(0, total - enrolled),
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


class EnrollmentViewSet(AuditedModelViewSet):
    queryset = Enrollment.objects.select_related("student", "section", "school_year").order_by("-id")
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class ParentPortalView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(get_parent_portal_data(user=request.user, request=request))