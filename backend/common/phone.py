"""International (E.164) & Philippines mobile phone number normalization."""

import re


def normalize_international_phone(raw_phone: str, default_country: str = "PH") -> str:
    """
    Normalizes both Philippines local/mobile formats and global E.164 phone numbers.
    - Preserves explicit international prefixes (`+1...`, `+44...`, `+65...`, `00...`).
    - Normalizes PH mobile numbers (`09XXXXXXXXX`, `9XXXXXXXXX`, `639XXXXXXXXX`) to `+639XXXXXXXXX`.
    - Returns empty string when no digits are provided.
    """
    raw = str(raw_phone or "").strip()
    if not raw:
        return ""

    has_plus = raw.startswith("+")
    digits = re.sub(r"\D+", "", raw)
    if not digits:
        return ""

    # International dialing prefix 00<country><number>
    if not has_plus and digits.startswith("00") and len(digits) >= 10:
        return f"+{digits[2:][:15]}"

    # Explicit E.164 international number (+<country_code><subscriber>, 8..15 digits)
    if has_plus:
        if digits.startswith("6309") and len(digits) == 13:
            return f"+63{digits[3:]}"
        return f"+{digits[:15]}"

    # Philippines local/mobile shorthand normalization
    if default_country.upper() == "PH":
        if digits.startswith("639") and len(digits) == 12:
            return f"+{digits}"
        if digits.startswith("09") and len(digits) == 11:
            return f"+63{digits[1:]}"
        if digits.startswith("9") and len(digits) == 10:
            return f"+63{digits}"

    # Fallback: emit valid E.164 format up to 15 digits
    return f"+{digits[:15]}"


def normalize_ph_phone(raw_phone: str) -> str:
    """Backward-compatible alias supporting both PH and international E.164 numbers."""
    return normalize_international_phone(raw_phone, default_country="PH")
