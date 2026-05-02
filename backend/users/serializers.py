from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
import re

from common.file_validation import RussianImageField, validate_image_upload

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

    def validate_password(self, value):
        errors = []

        if len(value) < 8:
            errors.append("Пароль должен содержать не менее 8 символов.")
        if not re.search(r"[A-Z]", value):
            errors.append("Пароль должен содержать хотя бы одну заглавную букву.")
        if not re.search(r"[a-z]", value):
            errors.append("Пароль должен содержать хотя бы одну строчную букву.")
        if not re.search(r"\d", value):
            errors.append("Пароль должен содержать хотя бы одну цифру.")
        if not re.search(r"[^\w\s]", value):
            errors.append("Пароль должен содержать хотя бы один специальный символ.")

        try:
            validate_password(value)
        except DjangoValidationError as exc:
            errors.extend(exc.messages)

        if errors:
            unique_errors = list(dict.fromkeys(errors))
            raise serializers.ValidationError(unique_errors)

        return value

    def create(self, validated_data):
        user = User(
            username=validated_data['username'],
            email=validated_data['email']
        )
        user.set_password(validated_data['password'])
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'avatar')


class ProfileSerializer(serializers.ModelSerializer):
    avatar = RussianImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "avatar")
        read_only_fields = ("id",)

    def validate_username(self, value):
        queryset = User.objects.filter(username__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Пользователь с таким никнеймом уже существует.")
        return value

    def validate_email(self, value):
        if not value:
            return value
        queryset = User.objects.filter(email__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Пользователь с таким email уже существует.")
        return value

    def validate_avatar(self, value):
        if value is None:
            return value
        return validate_image_upload(value, label="Аватар")


class UserSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "avatar")
