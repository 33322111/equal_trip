from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth import get_user_model
from rest_framework import serializers

from trips.models import Trip, TripMember
from .models import Expense, ExpenseCategory, ExpenseShare
from .fx import get_rate_to_rub

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
            "spent_at",
            "lat",
            "lng",
            "receipt",
            "created_by",
            "created_at",
            "shares",
        )
        read_only_fields = ("trip", "created_by", "created_at", "fx_rate", "amount_rub")


class ExpenseCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(required=False, allow_null=True)
    share_user_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)

    class Meta:
        model = Expense
        fields = (
            "title",
            "amount",
            "currency",
            "spent_at",
            "category_id",
            "lat",
            "lng",
            "share_user_ids",
        )

    def create(self, validated_data):
        request = self.context["request"]
        trip: Trip = self.context["trip"]

        category_id = validated_data.pop("category_id", None)
        share_user_ids = validated_data.pop("share_user_ids", None)

        category = None
        if category_id:
            category = ExpenseCategory.objects.get(id=category_id)

        # мультивалюта: считаем fx_rate и amount_rub
        amount = Decimal(str(validated_data.get("amount", "0")))
        currency = (validated_data.get("currency") or "RUB").upper()
        spent_at = validated_data.get("spent_at")
        rate = get_rate_to_rub(currency, spent_at.date() if spent_at else None)
        amount_rub = quant2(amount * Decimal(rate))

        expense = Expense.objects.create(
            trip=trip,
            created_by=request.user,
            category=category,
            fx_rate=rate,
            amount_rub=amount_rub,
            **validated_data,
        )

        # на кого делим:
        if share_user_ids is None:
            # по умолчанию: на всех участников поездки
            share_user_ids = list(
                TripMember.objects.filter(trip=trip).values_list("user_id", flat=True)
            )

        # создаём shares с равным weight=1
        ExpenseShare.objects.bulk_create(
            [ExpenseShare(expense=expense, user_id=uid, weight=Decimal("1")) for uid in share_user_ids]
        )

        return expense


class ExpenseUpdateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(required=False, allow_null=True)
    share_user_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    receipt = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Expense
        fields = (
            "title",
            "amount",
            "currency",
            "spent_at",
            "category_id",
            "lat",
            "lng",
            "share_user_ids",
            "receipt",
        )

    def update(self, instance: Expense, validated_data):
        category_id = validated_data.pop("category_id", None)
        share_user_ids = validated_data.pop("share_user_ids", None)

        if category_id is not None:
            instance.category = ExpenseCategory.objects.get(id=category_id) if category_id else None

        # применяем обычные поля (включая receipt/lat/lng)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        # мультивалюта: пересчитываем fx_rate и amount_rub после возможных изменений
        amount = Decimal(str(getattr(instance, "amount", "0")))
        currency = (getattr(instance, "currency", "RUB") or "RUB").upper()
        spent_at = getattr(instance, "spent_at", None)

        rate = get_rate_to_rub(currency, spent_at.date() if spent_at else None)
        instance.fx_rate = rate
        instance.amount_rub = quant2(amount * Decimal(rate))

        instance.save()

        # обновляем shares, если передали share_user_ids
        if share_user_ids is not None:
            member_ids = set(
                TripMember.objects.filter(trip=instance.trip).values_list("user_id", flat=True)
            )
            if not set(share_user_ids).issubset(member_ids):
                raise serializers.ValidationError("Some users are not members of the trip.")

            # пересоздаём shares
            ExpenseShare.objects.filter(expense=instance).delete()
            ExpenseShare.objects.bulk_create(
                [ExpenseShare(expense=instance, user_id=uid, weight=Decimal("1")) for uid in share_user_ids]
            )

        return instance