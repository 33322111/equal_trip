from concurrent.futures import ThreadPoolExecutor
from datetime import timezone as dt_timezone
from decimal import Decimal
import logging

import requests
from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections
from django.utils import timezone

from .models import ExchangeRate

OPENEXCHANGE_URL = "https://openexchangerates.org/api/historical/{date}.json"
CURRENCIES_URL = "https://openexchangerates.org/api/currencies.json"
_EXECUTOR = ThreadPoolExecutor(
    max_workers=getattr(settings, "FX_RATE_FETCH_MAX_WORKERS", 1),
    thread_name_prefix="equaltrip-fx",
)


class RateUnavailableError(Exception):
    pass


def _has_api_key() -> bool:
    return bool(str(getattr(settings, "OPENEXCHANGERATES_API_KEY", "") or "").strip())


def _missing_api_key_message() -> str:
    return "Не настроен OPENEXCHANGERATES_API_KEY. Добавьте ключ курсов валют в .env, чтобы использовать мультивалютные расходы."


def _normalize_date(target_date=None):
    return target_date or timezone.now().astimezone(dt_timezone.utc).date()


def _normalize_currencies(currencies=None):
    if not currencies:
        return None
    return {currency.upper() for currency in currencies}


def _store_rates_for_date(target_date, rates: dict, currencies=None):
    if "USD" not in rates or "RUB" not in rates:
        raise ValueError("Invalid rates data from OpenExchangeRates")

    currencies = _normalize_currencies(currencies)
    usd_to_rub = Decimal(str(rates["RUB"]))
    items = (
        ((currency, rates[currency]) for currency in currencies if currency in rates)
        if currencies is not None
        else rates.items()
    )

    for currency, cur_to_usd_raw in items:
        cur_to_usd = Decimal(str(cur_to_usd_raw))
        rate_to_rub = ((Decimal("1") / cur_to_usd) * usd_to_rub).quantize(Decimal("0.000001"))
        ExchangeRate.objects.update_or_create(
            currency=currency.upper(),
            date=target_date,
            defaults={"rate_to_rub": rate_to_rub},
        )


def refresh_rates_for_date(target_date=None, currencies=None):
    target_date = _normalize_date(target_date)
    rates = fetch_rates_for_date(target_date)
    _store_rates_for_date(target_date, rates, currencies=currencies)


def _refresh_rates_for_date_async(target_date, currencies=None):
    close_old_connections()
    try:
        refresh_rates_for_date(target_date, currencies=currencies)
    finally:
        close_old_connections()


def _clear_refresh_lock(cache_key, future):
    try:
        exc = future.exception()
        if exc is not None:
            logging.error(
                "Async exchange rate refresh failed",
                exc_info=(type(exc), exc, exc.__traceback__),
            )
    finally:
        cache.delete(cache_key)


def schedule_rates_refresh(target_date=None, currencies=None):
    if not getattr(settings, "FX_RATES_ASYNC", False) or not _has_api_key():
        return False

    target_date = _normalize_date(target_date)
    normalized_currencies = _normalize_currencies(currencies)
    currency_suffix = ",".join(sorted(normalized_currencies)) if normalized_currencies else "*"
    cache_key = f"fx-rates-refresh:{target_date.isoformat()}:{currency_suffix}"
    if not cache.add(cache_key, True, timeout=getattr(settings, "FX_RATE_FETCH_LOCK_SECONDS", 60)):
        return False

    future = _EXECUTOR.submit(_refresh_rates_for_date_async, target_date, normalized_currencies)
    future.add_done_callback(lambda f: _clear_refresh_lock(cache_key, f))
    return True


def get_rate_to_rub_fast(currency: str, target_date=None) -> Decimal:
    currency = currency.upper()
    if currency == "RUB":
        return Decimal("1")

    target_date = _normalize_date(target_date)
    rate = ExchangeRate.objects.filter(currency=currency, date=target_date).first()
    if rate:
        return rate.rate_to_rub

    if not _has_api_key():
        raise RateUnavailableError(_missing_api_key_message())

    if getattr(settings, "FX_RATES_ASYNC", False):
        schedule_rates_refresh(target_date, currencies=[currency])
        raise RateUnavailableError(
            f"Курс для {currency} на {target_date.strftime('%d.%m.%Y')} загружается. Повторите попытку через несколько секунд."
        )

    raise RateUnavailableError(
        f"Курс для {currency} на {target_date.strftime('%d.%m.%Y')} пока недоступен. Повторите попытку позже."
    )


def fetch_rates_for_date(target_date):
    if not _has_api_key():
        raise RateUnavailableError(_missing_api_key_message())
    url = OPENEXCHANGE_URL.format(date=target_date.strftime("%Y-%m-%d"))
    params = {
        "app_id": settings.OPENEXCHANGERATES_API_KEY,
    }
    resp = requests.get(url, params=params, timeout=getattr(settings, "FX_RATE_FETCH_TIMEOUT", 10))
    resp.raise_for_status()
    return resp.json()["rates"]


def get_rate_to_rub(currency: str, target_date=None) -> Decimal:
    currency = currency.upper()
    if currency == "RUB":
        return Decimal("1")

    target_date = _normalize_date(target_date)
    rate = ExchangeRate.objects.filter(currency=currency, date=target_date).first()
    if rate:
        return rate.rate_to_rub

    if not _has_api_key():
        raise RateUnavailableError(_missing_api_key_message())

    refresh_rates_for_date(target_date, currencies=[currency])
    refreshed = ExchangeRate.objects.filter(currency=currency, date=target_date).first()
    if refreshed:
        return refreshed.rate_to_rub

    raise ValueError("Invalid rates data from OpenExchangeRates")


def warm_today_rates():
    schedule_rates_refresh(timezone.now().astimezone(dt_timezone.utc).date())


def get_all_currencies():
    cache_key = "openexchangerates_currencies"
    data = cache.get(cache_key)
    if data:
        return data

    if not _has_api_key():
        raise RateUnavailableError(_missing_api_key_message())

    resp = requests.get(
        CURRENCIES_URL,
        params={"app_id": settings.OPENEXCHANGERATES_API_KEY},
        timeout=getattr(settings, "FX_RATE_FETCH_TIMEOUT", 10),
    )
    resp.raise_for_status()
    data = resp.json()

    cache.set(cache_key, data, 60 * 60 * 24)
    return data
