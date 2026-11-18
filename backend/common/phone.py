def normalize_ph_phone(raw_phone: str) -> str:
    digits = "".join(ch for ch in str(raw_phone or "") if ch.isdigit())
    if digits.startswith("639") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("09") and len(digits) == 11:
        return f"+63{digits[1:]}"
    if digits.startswith("9") and len(digits) == 10:
        return f"+63{digits}"
    return f"+{digits}" if digits else ""