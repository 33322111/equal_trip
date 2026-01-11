import requests
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from django.core.cache import cache

from .models import ExchangeRate

OPENEXCHANGE_URL = "https://openexchangerates.org/api/historical/{date}.json"
CURRENCIES_URL = "https://openexchangerates.org/api/currencies.json"


def fetch_rates_for_date(date):
    """
    Загружает курсы USD -> * на дату
    """
    url = OPENEXCHANGE_URL.format(date=date.strftime("%Y-%m-%d"))
    params = {
        "app_id": settings.OPENEXCHANGERATES_API_KEY,
    }
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()["rates"]


def get_rate_to_rub(currency: str, date=None) -> Decimal:
    currency = currency.upper()
    if currency == "RUB":
        return Decimal("1")

    if date is None:
        date = timezone.now().date()

    # 1. Пробуем взять из БД
    rate = ExchangeRate.objects.filter(currency=currency, date=date).first()
    if rate:
        return rate.rate_to_rub

    # 2. Тянем курсы с API
    rates = fetch_rates_for_date(date)

    if "USD" not in rates or "RUB" not in rates or currency not in rates:
        raise ValueError("Invalid rates data from OpenExchangeRates")

    usd_to_rub = Decimal(str(rates["RUB"]))
    cur_to_usd = Decimal(str(rates[currency]))

    rate_to_rub = ((1 / cur_to_usd) * usd_to_rub).quantize(Decimal("0.000001"))

    # 3. Сохраняем в БД
    ExchangeRate.objects.create(
        currency=currency,
        date=date,
        rate_to_rub=rate_to_rub,
    )

    return rate_to_rub


def get_all_currencies():
    """
    Возвращает словарь: { "USD": "United States Dollar", ... }
    Кэшируем на 24 часа.
    """
    cache_key = "openexchangerates_currencies"
    data = cache.get(cache_key)
    if data:
        return data

    resp = requests.get(
        CURRENCIES_URL,
        params={"app_id": settings.OPENEXCHANGERATES_API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    cache.set(cache_key, data, 60 * 60 * 24)
    return data