# D:\AttendSure_V3\backend\apps\accounts\urls.py

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    AuditLogListView,
    CurrentUserView,
    DemoLoginView,
    DemoStatusView,
    LoginView,
    PushTokenUpdateView,
    ResetDeviceLockView,
    TeacherViewSet,
    UnlockAccountsView,
    UserAccountViewSet,
    ValidateFieldView,
)

router = DefaultRouter()
router.register(r"teachers", TeacherViewSet, basename="teachers")
router.register(r"faculty", TeacherViewSet, basename="faculty")
router.register(r"users", UserAccountViewSet, basename="users")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("demo-status/", DemoStatusView.as_view(), name="demo-status"),
    path("demo-login/", DemoLoginView.as_view(), name="demo-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("validate-field/", ValidateFieldView.as_view(), name="validate-field"),
    path("push-token/", PushTokenUpdateView.as_view(), name="push-token"),
    path("reset-device/", ResetDeviceLockView.as_view(), name="reset-device"),
    path("reset-device/<int:pk>/", ResetDeviceLockView.as_view(), name="reset-device-pk"),
    path("unlock-accounts/", UnlockAccountsView.as_view(), name="unlock-accounts"),
    path("teachers/<int:pk>/reset-device/", ResetDeviceLockView.as_view(), name="teacher-reset-device"),
    path("faculty/<int:pk>/reset-device/", ResetDeviceLockView.as_view(), name="faculty-reset-device"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),
    path("", include(router.urls)),
]