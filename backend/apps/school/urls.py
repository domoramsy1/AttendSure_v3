from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    ClassPeriodViewSet,
    GradeLevelViewSet,
    RoomViewSet,
    SchoolHolidayViewSet,
    SchoolSettingsView,
    SchoolYearViewSet,
    SectionViewSet,
    SubjectViewSet,
)

router = DefaultRouter()
router.register(r"rooms", RoomViewSet, basename="rooms")
router.register(r"grade-levels", GradeLevelViewSet, basename="grade-levels")
router.register(r"years", SchoolYearViewSet, basename="school-years")
router.register(r"subjects", SubjectViewSet, basename="subjects")
router.register(r"sections", SectionViewSet, basename="sections")
router.register(r"periods", ClassPeriodViewSet, basename="periods")
router.register(r"holidays", SchoolHolidayViewSet, basename="holidays")

urlpatterns = [
    path("settings/", SchoolSettingsView.as_view(), name="school-settings"),
    path("", include(router.urls)),
]