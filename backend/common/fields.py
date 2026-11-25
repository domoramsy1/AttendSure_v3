# AttendSure Backend - Common Fields
# File: D:\AttendSure_V3\backend\common\fields.py

import json
from django.db import models


class SafeJsonField(models.JSONField):
    """
    Safely reads PostgreSQL JSONB and array columns that psycopg2
    already deserializes into Python list or dict objects.
    """

    def from_db_value(self, value, expression, connection):
        if value is None or isinstance(value, (dict, list, int, float, bool)):
            return value
        if isinstance(value, (bytes, bytearray)):
            value = value.decode("utf-8", errors="replace")
        if isinstance(value, str):
            try:
                return json.loads(value, cls=self.decoder)
            except ValueError:
                return value
        return value

    def deconstruct(self):
        name, _, args, kwargs = super().deconstruct()
        return name, "django.db.models.JSONField", args, kwargs
