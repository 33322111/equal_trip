from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
import re

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
    class Meta:
        model = User
        fields = ("id", "username", "email", "avatar")
        read_only_fields = ("id",)


class UserSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "avatar")
