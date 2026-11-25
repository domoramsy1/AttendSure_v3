# AttendSure Backend - Common GPS
# File: D:\AttendSure_V3\backend\common\gps.py

import math

MAX_ALLOWED_GPS_ACCURACY_METERS = 250.0


def calculate_distance_meters(lat1, lon1, lat2, lon2) -> float:
    try:
        u_lat, u_lon = float(lat1), float(lon1)
        c_lat, c_lon = float(lat2), float(lon2)
    except (TypeError, ValueError):
        return float("inf")

    if not all(math.isfinite(v) for v in (u_lat, u_lon, c_lat, c_lon)):
        return float("inf")

    earth_radius = 6371000.0
    phi1, phi2 = math.radians(c_lat), math.radians(u_lat)
    d_phi = math.radians(u_lat - c_lat)
    d_lambda = math.radians(u_lon - c_lon)
    a = (math.sin(d_phi / 2.0) ** 2) + math.cos(phi1) * math.cos(phi2) * (math.sin(d_lambda / 2.0) ** 2)
    a = max(0.0, min(1.0, a))
    return round(earth_radius * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))), 1)


def verify_campus_gps(
    *,
    latitude,
    longitude,
    campus_lat,
    campus_lon,
    radius_meters: int = 150,
    accuracy_meters=None,
    is_mock_location: bool = False,
) -> dict:
    if is_mock_location:
        return {
            "is_valid": False,
            "is_inside": False,
            "distance_meters": None,
            "allowed_radius": radius_meters,
            "reason": "A mock location setting appears to be turned on. Please disable mock locations in your phone settings and try again.",
        }

    try:
        u_lat, u_lon = float(latitude), float(longitude)
        c_lat, c_lon = float(campus_lat), float(campus_lon)
    except (TypeError, ValueError):
        return {
            "is_valid": False,
            "is_inside": False,
            "distance_meters": None,
            "allowed_radius": radius_meters,
            "reason": "We could not read your phone's GPS location. Turn on Location Services and try again.",
        }

    if (
        not all(math.isfinite(v) for v in (u_lat, u_lon, c_lat, c_lon))
        or not (-90.0 <= u_lat <= 90.0)
        or not (-180.0 <= u_lon <= 180.0)
        or (u_lat == 0.0 and u_lon == 0.0)
    ):
        return {
            "is_valid": False,
            "is_inside": False,
            "distance_meters": None,
            "allowed_radius": radius_meters,
            "reason": "Your phone sent an unclear GPS reading. Step near a window or outdoors and try again.",
        }

    acc_val = 0.0
    if accuracy_meters is not None and str(accuracy_meters).strip() != "":
        try:
            acc_val = float(accuracy_meters)
        except (TypeError, ValueError):
            return {
                "is_valid": False,
                "is_inside": False,
                "distance_meters": None,
                "allowed_radius": radius_meters,
                "reason": "Invalid GPS accuracy value.",
            }
        if not math.isfinite(acc_val) or acc_val < 0.0:
            return {
                "is_valid": False,
                "is_inside": False,
                "distance_meters": None,
                "allowed_radius": radius_meters,
                "reason": "GPS accuracy value is invalid.",
            }
        if acc_val > MAX_ALLOWED_GPS_ACCURACY_METERS:
            return {
                "is_valid": False,
                "is_inside": False,
                "distance_meters": None,
                "allowed_radius": radius_meters,
                "reason": (
                    f"Your GPS signal is weak right now (±{round(acc_val)}m). "
                    f"Step near a window or outdoors for a clearer signal (within {int(MAX_ALLOWED_GPS_ACCURACY_METERS)}m)."
                ),
            }

    distance = calculate_distance_meters(u_lat, u_lon, c_lat, c_lon)
    drift_buffer = min(max(acc_val, 0.0), 35.0)
    is_inside = math.isfinite(distance) and distance <= (radius_meters + drift_buffer)

    return {
        "is_valid": True,
        "is_inside": is_inside,
        "distance_meters": distance if math.isfinite(distance) else None,
        "allowed_radius": radius_meters,
        "reason": (
            "On campus — inside the school boundary."
            if is_inside
            else f"Outside the school boundary ({round(distance)}m from campus center). Step inside the school boundary to Time In or Time Out."
        ),
    }
