"""
AttendSure - Resilient API Pagination
File: backend/apps/api/pagination.py
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 10000

    def get_page_size(self, request):
        if self.page_size_query_param:
            param = request.query_params.get(self.page_size_query_param)
            if param:
                clean_param = str(param).strip().upper()
                if clean_param in ('ALL', 'MAX', 'NONE'):
                    return self.max_page_size
                try:
                    val = int(clean_param)
                    if val > 0:
                        return min(val, self.max_page_size)
                except (ValueError, TypeError):
                    pass
        return self.page_size

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': self.get_page_size(self.request),
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        })