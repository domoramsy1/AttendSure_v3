# D:\AttendSure_V3\backend\apps\accounts\urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AuditLogListView,
    ChangePasswordView,
    CurrentProfileView,
    CurrentUserView,
    DemoLoginView,
    DemoStatusView,
    FacultyDropdownView,
    FacultyProfileViewSet,
    FieldAvailabilityView,
    LoginView,
    RegisterPushTokenView,
    ResetBoundDeviceView,
    UnlockAccountsView,
    UserAccountViewSet,
)

router = DefaultRouter()
router.register(r"faculty", FacultyProfileViewSet, basename="faculty")
router.register(r"users", UserAccountViewSet, basename="users")

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("token/", LoginView.as_view(), name="auth-token"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("demo-status/", DemoStatusView.as_view(), name="auth-demo-status"),
    path("demo-login/", DemoLoginView.as_view(), name="auth-demo-login"),
    path("me/", CurrentUserView.as_view(), name="auth-me"),
    path("profile/", CurrentProfileView.as_view(), name="auth-profile"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("check-availability/", FieldAvailabilityView.as_view(), name="auth-check-availability"),
    path("validate-field/", FieldAvailabilityView.as_view(), name="auth-validate-field"),
    path("push-token/", RegisterPushTokenView.as_view(), name="auth-push-token"),
    path("register-push-token/", RegisterPushTokenView.as_view(), name="auth-register-push-token"),
    path("faculty/dropdown/", FacultyDropdownView.as_view(), name="faculty-dropdown"),
    path("faculty-dropdown/", FacultyDropdownView.as_view(), name="faculty-dropdown-alt"),
    path("reset-device/<int:pk>/", ResetBoundDeviceView.as_view(), name="auth-reset-device"),
    path("reset-device/", ResetBoundDeviceView.as_view(), name="auth-reset-device-body"),
    path("unlock-accounts/", UnlockAccountsView.as_view(), name="auth-unlock-accounts"),
    path("unlock-all/", UnlockAccountsView.as_view(), name="auth-unlock-all"),
    path("audit-logs/", AuditLogListView.as_view(), name="auth-audit-logs"),
    path("", include(router.urls)),
]