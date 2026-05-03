from datetime import datetime, time, timezone as dt_timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from common.file_validation import RussianFileField, validate_receipt_upload
from trips.models import Trip, TripMember
from .models import Expense, ExpenseCategory, ExpenseShare
from .fx import RateUnavailableError, get_rate_to_rub_fast

User = get_user_model()


def quant2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ("id", "name")


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")


class ExpenseShareSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)

    class Meta:
        model = ExpenseShare
        fields = ("id", "user", "weight")


class ShareAmountInputSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))


def _trip_member_ids(trip: Trip):
    return set(TripMember.objects.filter(trip=trip).values_list("user_id", flat=True))


def _resolve_client_timezone(request) -> dt_timezone | ZoneInfo:
    if request is not None:
        timezone_name = request.headers.get("X-Client-Timezone")
        if timezone_name:
            try:
                return ZoneInfo(timezone_name)
            except ZoneInfoNotFoundError:
                pass
    return timezone.get_default_timezone()


def _client_today(client_tz):
    return timezone.now().astimezone(client_tz).date()


def _current_utc_date():
    return timezone.now().astimezone(dt_timezone.utc).date()


def _ensure_aware_in_timezone(value, target_tz):
    if timezone.is_naive(value):
        return timezone.make_aware(value, target_tz)
    return value


def _resolve_rate_lookup_date(*, spent_at, spent_time_known: bool, request):
    if not spent_at:
        return None

    client_tz = _resolve_client_timezone(request)
    spent_at = _ensure_aware_in_timezone(spent_at, client_tz)

    if spent_time_known:
        return spent_at.astimezone(dt_timezone.utc).date()

    spent_local_date = spent_at.astimezone(client_tz).date()
    return min(spent_local_date, _current_utc_date())


def _resolve_spent_datetime(validated_data, *, request=None):
    spent_date = validated_data.pop("spent_date", serializers.empty)
    spent_time = validated_data.pop("spent_time", serializers.empty)
    client_tz = _resolve_client_timezone(request)
    today = _client_today(client_tz)

    if spent_date is serializers.empty and spent_time is serializers.empty:
        if "spent_at" in validated_data:
            spent_at = validated_data["spent_at"]
            if spent_at:
                spent_at = _ensure_aware_in_timezone(spent_at, client_tz)
                validated_data["spent_at"] = spent_at
                validated_data["spent_date_local"] = spent_at.astimezone(client_tz).date()
            else:
                validated_data["spent_date_local"] = None
            if spent_at and spent_at.astimezone(client_tz).date() > today:
                raise serializers.ValidationError({"spent_date": ["Дата расхода не может быть в будущем."]})
            validated_data["spent_time_known"] = bool(validated_data["spent_at"])
        return

    if spent_date in (serializers.empty, None):
        if spent_time not in (serializers.empty, None):
            raise serializers.ValidationError({"spent_time": ["Укажите дату расхода, если задаёте время."]})
        validated_data["spent_at"] = None
        validated_data["spent_date_local"] = None
        validated_data["spent_time_known"] = False
        return

    if spent_date > today:
        raise serializers.ValidationError({"spent_date": ["Дата расхода не может быть в будущем."]})

    if spent_time in (serializers.empty, None):
        spent_at = timezone.make_aware(datetime.combine(spent_date, time.min), client_tz)
        validated_data["spent_at"] = spent_at
        validated_data["spent_date_local"] = spent_date
        validated_data["spent_time_known"] = False
        return

    spent_at = timezone.make_aware(datetime.combine(spent_date, spent_time), client_tz)
    validated_data["spent_at"] = spent_at
    validated_data["spent_date_local"] = spent_date
    validated_data["spent_time_known"] = True


def _prepare_share_weights(
    *,
    trip: Trip,
    expense_amount: Decimal,
    share_user_ids,
    share_amounts,
    default_to_all_members: bool,
):
    member_ids = _trip_member_ids(trip)

    if share_amounts is not None:
        if len(share_amounts) == 0:
            raise serializers.ValidationError({"share_amounts": "Нужно указать хотя бы одного участника."})

        user_ids = [item["user_id"] for item in share_amounts]
        if len(user_ids) != len(set(user_ids)):
            raise serializers.ValidationError({"share_amounts": "Пользователи в списке долей должны быть уникальны."})
        if not set(user_ids).issubset(member_ids):
            raise serializers.ValidationError({"share_amounts": "Some users are not members of the trip."})

        total_share_amount = quant2(
            sum((Decimal(str(item["amount"])) for item in share_amounts), Decimal("0"))
        )
        expected_amount = quant2(Decimal(str(expense_amount)))
        if total_share_amount != expected_amount:
            raise serializers.ValidationError(
                {
                    "share_amounts": (
                        f"Сумма долей ({total_share_amount}) должна быть равна сумме расхода ({expected_amount})."
                    )
                }
            )

        return [(item["user_id"], Decimal(str(item["amount"]))) for item in share_amounts]

    if share_user_ids is None:
        if not default_to_all_members:
            return None
        share_user_ids = list(member_ids)

    if len(share_user_ids) == 0:
        raise serializers.ValidationError({"share_user_ids": "Нужно выбрать хотя бы одного участника."})
    if len(share_user_ids) != len(set(share_user_ids)):
        raise serializers.ValidationError({"share_user_ids": "Пользователи в списке должны быть уникальны."})
    if not set(share_user_ids).issubset(member_ids):
        raise serializers.ValidationError({"share_user_ids": "Some users are not members of the trip."})

    return [(uid, Decimal("1")) for uid in share_user_ids]


class ExpenseSerializer(serializers.ModelSerializer):
    created_by = UserShortSerializer(read_only=True)
    category = CategorySerializer(read_only=True)
    shares = ExpenseShareSerializer(many=True, read_only=True)

    class Meta:
        model = Expense
        fields = (
            "id",
            "trip",
            "title",
            "amount",
            "currency",
            "fx_rate",
            "amount_rub",
            "category",
            "spent_date_local",
            "spent_at",
            "spent_time_known",
            "lat",
            "lng",
            "receipt",
            "created_by",
            "created_at",
            "shares",
        )
        read_only_fields = ("trip", "created_by", "created_at", "fx_rate", "amount_rub", "spent_date_local")


class ExpenseCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(required=False, allow_null=True)
    spent_date = serializers.DateField(required=False, allow_null=True, write_only=True)
    spent_time = serializers.TimeField(required=False, allow_null=True, write_only=True)
    share_user_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    share_amounts = ShareAmountInputSerializer(many=True, required=False)
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)

    class Meta:
        model = Expense
        fields = (
            "title",
            "amount",
            "currency",
            "spent_at",
            "spent_date",
            "spent_time",
            "category_id",
            "lat",
            "lng",
            "share_user_ids",
            "share_amounts",
        )

    def create(self, validated_data):
        request = self.context["request"]
        trip: Trip = self.context["trip"]

        _resolve_spent_datetime(validated_data, request=request)

        category_id = validated_data.pop("category_id", None)
        share_user_ids = validated_data.pop("share_user_ids", None)
        share_amounts = validated_data.pop("share_amounts", None)

        if share_user_ids is not None and share_amounts is not None:
            raise serializers.ValidationError("Передайте либо share_user_ids, либо share_amounts.")

        category = None
        if category_id:
            category = ExpenseCategory.objects.get(id=category_id)

        # мультивалюта: считаем fx_rate и amount_rub
        amount = Decimal(str(validated_data.get("amount", "0")))
        currency = (validated_data.get("currency") or "RUB").upper()
        spent_at = validated_data.get("spent_at")
        spent_time_known = validated_data.get("spent_time_known", bool(spent_at))
        rate_lookup_date = _resolve_rate_lookup_date(
            spent_at=spent_at,
            spent_time_known=spent_time_known,
            request=request,
        )
        try:
            rate = get_rate_to_rub_fast(currency, rate_lookup_date)
        except RateUnavailableError as exc:
            raise serializers.ValidationError({"currency": [str(exc)]}) from exc
        amount_rub = quant2(amount * Decimal(rate))

        expense = Expense.objects.create(
            trip=trip,
            created_by=request.user,
            category=category,
            fx_rate=rate,
            amount_rub=amount_rub,
            **validated_data,
        )

        share_rows = _prepare_share_weights(
            trip=trip,
            expense_amount=amount,
            share_user_ids=share_user_ids,
            share_amounts=share_amounts,
            default_to_all_members=True,
        )

        ExpenseShare.objects.bulk_create(
            [ExpenseShare(expense=expense, user_id=uid, weight=weight) for uid, weight in share_rows]
        )

        return expense


class ExpenseUpdateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(required=False, allow_null=True)
    spent_date = serializers.DateField(required=False, allow_null=True, write_only=True)
    spent_time = serializers.TimeField(required=False, allow_null=True, write_only=True)
    share_user_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    share_amounts = ShareAmountInputSerializer(many=True, required=False)
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    receipt = RussianFileField(required=False, allow_null=True)

    class Meta:
        model = Expense
        fields = (
            "title",
            "amount",
            "currency",
            "spent_at",
            "spent_date",
            "spent_time",
            "category_id",
            "lat",
            "lng",
            "share_user_ids",
            "share_amounts",
            "receipt",
        )

    def validate_receipt(self, value):
        if value is None:
            return value
        return validate_receipt_upload(value, label="Чек")

    def update(self, instance: Expense, validated_data):
        request = self.context.get("request")
        _resolve_spent_datetime(validated_data, request=request)

        category_id = validated_data.pop("category_id", None)
        share_user_ids = validated_data.pop("share_user_ids", serializers.empty)
        share_amounts = validated_data.pop("share_amounts", serializers.empty)
        amount_changed = "amount" in validated_data
        currency_changed = "currency" in validated_data
        spent_at_changed = "spent_at" in validated_data

        if share_user_ids is not serializers.empty and share_amounts is not serializers.empty:
            raise serializers.ValidationError("Передайте либо share_user_ids, либо share_amounts.")

        if category_id is not None:
            instance.category = ExpenseCategory.objects.get(id=category_id) if category_id else None

        # применяем обычные поля (включая receipt/lat/lng)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        if currency_changed or spent_at_changed:
            amount = Decimal(str(getattr(instance, "amount", "0")))
            currency = (getattr(instance, "currency", "RUB") or "RUB").upper()
            spent_at = getattr(instance, "spent_at", None)
            spent_time_known = getattr(instance, "spent_time_known", bool(spent_at))
            rate_lookup_date = _resolve_rate_lookup_date(
                spent_at=spent_at,
                spent_time_known=spent_time_known,
                request=request,
            )
            try:
                rate = get_rate_to_rub_fast(currency, rate_lookup_date)
            except RateUnavailableError as exc:
                raise serializers.ValidationError({"currency": [str(exc)]}) from exc
            instance.fx_rate = rate
            instance.amount_rub = quant2(amount * Decimal(rate))
        elif amount_changed:
            amount = Decimal(str(getattr(instance, "amount", "0")))
            instance.amount_rub = quant2(amount * Decimal(str(instance.fx_rate)))

        instance.save()

        if share_user_ids is not serializers.empty or share_amounts is not serializers.empty:
            share_rows = _prepare_share_weights(
                trip=instance.trip,
                expense_amount=Decimal(str(instance.amount)),
                share_user_ids=None if share_user_ids is serializers.empty else share_user_ids,
                share_amounts=None if share_amounts is serializers.empty else share_amounts,
                default_to_all_members=False,
            )

            ExpenseShare.objects.filter(expense=instance).delete()
            ExpenseShare.objects.bulk_create(
                [ExpenseShare(expense=instance, user_id=uid, weight=weight) for uid, weight in share_rows]
            )

        return instance
