from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    AuditLogListView,
    CurrentUserView,
    LoginView,
    PushTokenUpdateView,
    ResetDeviceLockView,
    TeacherViewSet,
    UserAccountViewSet,
    ValidateFieldView,
)

router = DefaultRouter()
router.register(r"teachers", TeacherViewSet, basename="teachers")
router.register(r"users", UserAccountViewSet, basename="users")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("validate-field/", ValidateFieldView.as_view(), name="validate-field"),
    path("push-token/", PushTokenUpdateView.as_view(), name="push-token"),
    path("reset-device/", ResetDeviceLockView.as_view(), name="reset-device"),
    path("teachers/<int:pk>/reset-device/", ResetDeviceLockView.as_view(), name="teacher-reset-device"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),
    path("", include(router.urls)),
]