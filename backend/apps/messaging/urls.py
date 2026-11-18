from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import ChatMessageView, ChatThreadListView, MarkNotificationsReadView, NotificationViewSet

router = DefaultRouter()
router.register(r"notifications", NotificationViewSet, basename="notifications")

urlpatterns = [
    path("notifications/mark-read/", MarkNotificationsReadView.as_view(), name="notifications-mark-read"),
    path("threads/", ChatThreadListView.as_view(), name="chat-threads"),
    path("messages/", ChatMessageView.as_view(), name="chat-messages"),
    path("", include(router.urls)),
]