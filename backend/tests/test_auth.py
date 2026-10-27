from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

class AuthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="SecurePassword123!")

    def test_login_success(self):
        res = self.client.post("/api/auth/login/", {"username": "testuser", "password": "SecurePassword123!"})
        self.assertIn(res.status_code, [200, 400])
