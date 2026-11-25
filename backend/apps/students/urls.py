from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import EnrollmentViewSet, StudentViewSet

router = DefaultRouter()
router.register(r"enrollments", EnrollmentViewSet, basename="enrollments")
router.register(r"", StudentViewSet, basename="students")

urlpatterns = [
    path("", include(router.urls)),
]
