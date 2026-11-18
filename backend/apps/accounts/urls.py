from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    AuditLogListView,
    CurrentProfileView,
    LoginView,
    ResetDeviceBindingView,
    SavePushTokenView,
    TeacherViewSet,
    UserAccountViewSet,
    ValidateFieldView,
)

router = DefaultRouter()
router.register(r"teachers", TeacherViewSet, basename="teachers")
router.register(r"users", UserAccountViewSet, basename="users")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("token/", TokenObtainPairView.as_view(), name="jwt-token"),
    path("token/refresh/", TokenRefreshView.as_view(), name="jwt-refresh"),
    path("me/", CurrentProfileView.as_view(), name="current-profile"),
    path("validate-field/", ValidateFieldView.as_view(), name="validate-field"),
    path("push-token/", SavePushTokenView.as_view(), name="save-push-token"),
    path("reset-device/", ResetDeviceBindingView.as_view(), name="reset-device"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),
    path("", include(router.urls)),
]