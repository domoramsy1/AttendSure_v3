from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import Section, SchoolProfile, FacultyProfile, FacultyMonthlyDTR
from apps.academics.services.sf1_service import get_sf1_data
from apps.academics.services.sf2_service import generate_sf2_data
from apps.academics.services.sf4_service import generate_sf4_data
from .common import is_leadership_role, resolve_faculty_for_user, resolve_logo_field

class DepEdSF1DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, section_id):
        try:
            data = get_sf1_data(section_id, school_year=request.query_params.get('school_year'))
            if data.get('left_logo'): data['left_logo'] = resolve_logo_field(data['left_logo'], request)
            if data.get('right_logo'): data['right_logo'] = resolve_logo_field(data['right_logo'], request)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DepEdSF2DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, section_id):
        m = request.query_params.get('month', 'October')
        y = request.query_params.get('year', 2026)
        try:
            data = generate_sf2_data(section_id, month_name=m, year=y)
            if data.get('left_logo'): data['left_logo'] = resolve_logo_field(data['left_logo'], request)
            if data.get('right_logo'): data['right_logo'] = resolve_logo_field(data['right_logo'], request)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DepEdSF4DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        m = request.query_params.get('month', 'October')
        y = request.query_params.get('year', 2026)
        sy = request.query_params.get('school_year', '')
        try:
            data = generate_sf4_data(month_name=m, year=y, school_year=sy)
            if data.get('left_logo'): data['left_logo'] = resolve_logo_field(data['left_logo'], request)
            if data.get('right_logo'): data['right_logo'] = resolve_logo_field(data['right_logo'], request)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DTRListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, faculty_id=None):
        user = request.user
        target_faculty = None
        if is_leadership_role(user) and faculty_id:
            target_faculty = FacultyProfile.objects.filter(id=faculty_id).first()
        if not target_faculty:
            target_faculty = resolve_faculty_for_user(user)

        if not target_faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        month = int(request.query_params.get('month', 10))
        year = int(request.query_params.get('year', 2026))

        school = SchoolProfile.objects.first()
        dtr_rec = FacultyMonthlyDTR.objects.filter(faculty=target_faculty, month=month, year=year).first()

        rows = [{
            'day': day,
            'am_arrival': '', 'am_departure': '',
            'pm_arrival': '', 'pm_departure': '',
            'undertime_hours': '', 'undertime_minutes': '',
            'is_weekend': False, 'is_loafing': False,
        } for day in range(1, 32)]

        return Response({
            'faculty_id': target_faculty.id,
            'faculty_name': target_faculty.full_name,
            'employee_id': target_faculty.employee_id,
            'month': 'October',
            'month_number': month,
            'year': year,
            'regular_days_hours': dtr_rec.regular_hours if dtr_rec else '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM',
            'saturdays_hours': dtr_rec.saturday_hours if dtr_rec else 'As Required',
            'school_head': str(school.principal_name or '').upper() if school else '',
            'dtr_submitted': dtr_rec.is_submitted if dtr_rec else False,
            'dept_head_approved': dtr_rec.is_dept_head_approved if dtr_rec else False,
            'rows': rows,
            'total_undertime_hours': 0,
            'total_undertime_minutes': 0,
            'days_present': 0,
        }, status=status.HTTP_200_OK)

    def post(self, request, faculty_id=None):
        action = request.data.get('action')
        month = int(request.data.get('month', 10))
        year = int(request.data.get('year', 2026))

        target_faculty = FacultyProfile.objects.filter(id=faculty_id).first() if faculty_id else resolve_faculty_for_user(request.user)
        if not target_faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        dtr, _ = FacultyMonthlyDTR.objects.get_or_create(faculty=target_faculty, month=month, year=year)
        if action == 'SUBMIT_DTR':
            dtr.is_submitted = True
            dtr.save()
            return Response({'success': True, 'message': 'DTR submitted.'}, status=status.HTTP_200_OK)
        elif action == 'APPROVE_DEPT_HEAD' and is_leadership_role(request.user):
            dtr.is_dept_head_approved = True
            dtr.save()
            return Response({'success': True, 'message': 'DTR approved.'}, status=status.HTTP_200_OK)
        return Response({'success': True}, status=status.HTTP_200_OK)

class UnifiedReportExportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return self._handle(request, request.data)

    def get(self, request):
        return self._handle(request, request.query_params)

    def _handle(self, request, params):
        rep = params.get('report_type', 'REPORT')
        sec = params.get('section_id')
        m = params.get('month', 'October')
        y = params.get('year', 2026)
        title = f"AttendSure_{rep}_Report_{m}_{y}"
        html = f"<html><body><h2>Official {rep} Document</h2><p>Section: {sec or 'N/A'}</p></body></html>"
        return Response({'title': title, 'html': html, 'status': 'ready'}, status=status.HTTP_200_OK)

class UnifiedReportPrintAPIView(UnifiedReportExportAPIView):
    pass

class ReportAuditLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request): return Response({'success': True}, status=status.HTTP_201_CREATED)
    def get(self, request): return Response([], status=status.HTTP_200_OK)
