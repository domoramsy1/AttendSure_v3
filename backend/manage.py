#!/usr/bin/env python
import os
import sys


def main():
    if os.environ.get("DJANGO_SETTINGS_MODULE") == "attendsure_core.settings":
        os.environ.pop("DJANGO_SETTINGS_MODULE", None)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()