from rest_framework import serializers
from django.utils import timezone

from common.file_validation import RussianFileField, validate_document_upload
from .models import Settlement


class SettlementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Settlement
        fields = (
            "id",
            "trip",
            "from_user",
            "to_user",
            "amount",
            "currency",
            "status",
            "proof",
            "created_at",
            "confirmed_at",
        )
        read_only_fields = ("id", "trip", "status", "created_at", "confirmed_at")


class SettlementCreateSerializer(serializers.ModelSerializer):
    proof = RussianFileField(required=False, allow_null=True)

    class Meta:
        model = Settlement
        fields = ("from_user", "to_user", "amount", "currency", "proof")

    def validate_proof(self, value):
        if value is None:
            return value
        return validate_document_upload(value, label="Подтверждение оплаты")

    def validate(self, attrs):
        if attrs["from_user"] == attrs["to_user"]:
            raise serializers.ValidationError("from_user and to_user must be different")
        if attrs["amount"] <= 0:
            raise serializers.ValidationError("amount must be > 0")
        return attrs


class SettlementConfirmSerializer(serializers.ModelSerializer):
    proof = RussianFileField(required=False, allow_null=True)

    class Meta:
        model = Settlement
        fields = ("proof",)

    def validate_proof(self, value):
        if value is None:
            return value
        return validate_document_upload(value, label="Подтверждение оплаты")

    def update(self, instance, validated_data):
        instance.status = Settlement.Status.CONFIRMED
        instance.confirmed_at = timezone.now()
        if "proof" in validated_data:
            instance.proof = validated_data["proof"]
        instance.save()
        return instance
