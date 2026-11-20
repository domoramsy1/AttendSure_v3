from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AdviserMatrixView,
    AssignedClassListView,
    ClassAttendanceView,
    ExitPassViewSet,
    OfflineQrSyncView,
    ScanStudentQrView,
)

router = DefaultRouter()
router.register(r"exit-passes", ExitPassViewSet, basename="exit-passes")

urlpatterns = [
    path("scan/", ScanStudentQrView.as_view(), name="scan-qr"),
    path("offline-sync/", OfflineQrSyncView.as_view(), name="offline-sync"),
    path("records/", ClassAttendanceView.as_view(), name="attendance-records"),
    path("classes/", AssignedClassListView.as_view(), name="assigned-classes"),
    path("adviser-matrix/", AdviserMatrixView.as_view(), name="adviser-matrix"),
    path("", include(router.urls)),
]