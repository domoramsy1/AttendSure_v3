from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import EnrollmentViewSet, ParentPortalView, StudentViewSet

router = DefaultRouter()
router.register(r"enrollments", EnrollmentViewSet, basename="enrollments")
router.register(r"", StudentViewSet, basename="students")

urlpatterns = [
    path("parent-portal/", ParentPortalView.as_view(), name="parent-portal"),
    path("", include(router.urls)),
]