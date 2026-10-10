from django.core.management.base import BaseCommand
from apps.core.fingerprint import get_server_fingerprint

class Command(BaseCommand):
    help = 'Displays the unique server hardware fingerprint for licensing.'

    def handle(self, *args, **options):
        fp = get_server_fingerprint()
        self.stdout.write(self.style.SUCCESS('\n=========================================='))
        self.stdout.write(self.style.SUCCESS('  ATTENDSURE SERVER HARDWARE FINGERPRINT  '))
        self.stdout.write(self.style.SUCCESS('=========================================='))
        self.stdout.write(f'\nFingerprint: {fp}\n')
        self.stdout.write('Use this identifier when generating a license.\n')
