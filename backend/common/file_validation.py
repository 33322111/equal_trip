from pathlib import Path

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers


DEFAULT_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

ALLOWED_DOCUMENT_CONTENT_TYPES = ALLOWED_IMAGE_CONTENT_TYPES | {"application/pdf"}
ALLOWED_DOCUMENT_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | {".pdf"}


class RussianFileField(serializers.FileField):
    default_error_messages = {
        "required": "Это поле обязательно.",
        "null": "Это поле не может быть пустым.",
        "invalid": "Загрузите корректный файл.",
        "no_name": "У загруженного файла должно быть имя.",
        "empty": "Загруженный файл пуст.",
        "max_length": "Имя файла слишком длинное.",
    }


class RussianImageField(serializers.ImageField):
    default_error_messages = {
        **RussianFileField.default_error_messages,
        "invalid_image": "Загрузите корректное изображение. Файл поврежден или не является изображением.",
    }


def _format_file_size(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        size_mb = size_bytes / (1024 * 1024)
        return f"{int(size_mb)} МБ" if float(size_mb).is_integer() else f"{size_mb:.1f} МБ"
    if size_bytes >= 1024:
        size_kb = size_bytes / 1024
        return f"{int(size_kb)} КБ" if float(size_kb).is_integer() else f"{size_kb:.1f} КБ"
    return f"{size_bytes} Б"


def _validate_upload(
    file,
    *,
    label: str,
    max_size: int,
    allowed_extensions: set[str],
    allowed_content_types: set[str],
    type_error_message: str,
):
    if file is None:
        return file

    size = getattr(file, "size", None)
    if size is not None and size > max_size:
        raise serializers.ValidationError(
            f"{label} слишком большой. Максимальный размер — {_format_file_size(max_size)}."
        )

    extension = Path(getattr(file, "name", "")).suffix.lower()
    if extension and extension not in allowed_extensions:
        raise serializers.ValidationError(type_error_message)

    content_type = getattr(file, "content_type", None)
    if content_type and content_type.lower() not in allowed_content_types:
        raise serializers.ValidationError(type_error_message)

    return file


def _validate_image_contents(file, *, label: str):
    extension = Path(getattr(file, "name", "")).suffix.lower()
    content_type = (getattr(file, "content_type", "") or "").lower()
    is_image_like = extension in ALLOWED_IMAGE_EXTENSIONS or content_type in ALLOWED_IMAGE_CONTENT_TYPES
    if not is_image_like:
        return file

    current_position = None
    try:
        if hasattr(file, "tell"):
            current_position = file.tell()
        if hasattr(file, "seek"):
            file.seek(0)
        with Image.open(file) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise serializers.ValidationError(
            f"Загрузите корректное изображение. Файл поврежден или не является изображением."
        )
    finally:
        if hasattr(file, "seek"):
            file.seek(0 if current_position is None else current_position)

    return file


def validate_image_upload(file, *, label: str):
    file = _validate_upload(
        file,
        label=label,
        max_size=getattr(settings, "IMAGE_UPLOAD_MAX_BYTES", DEFAULT_IMAGE_UPLOAD_MAX_BYTES),
        allowed_extensions=ALLOWED_IMAGE_EXTENSIONS,
        allowed_content_types=ALLOWED_IMAGE_CONTENT_TYPES,
        type_error_message=f"{label} должен быть изображением формата JPG, PNG, GIF или WEBP.",
    )
    return _validate_image_contents(file, label=label)


def validate_document_upload(file, *, label: str):
    file = _validate_upload(
        file,
        label=label,
        max_size=getattr(settings, "DOCUMENT_UPLOAD_MAX_BYTES", DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES),
        allowed_extensions=ALLOWED_DOCUMENT_EXTENSIONS,
        allowed_content_types=ALLOWED_DOCUMENT_CONTENT_TYPES,
        type_error_message=f"{label} должен быть файлом формата PDF, JPG, PNG, GIF или WEBP.",
    )
    return _validate_image_contents(file, label=label)


def validate_receipt_upload(file, *, label: str):
    file = _validate_upload(
        file,
        label=label,
        max_size=getattr(settings, "IMAGE_UPLOAD_MAX_BYTES", DEFAULT_IMAGE_UPLOAD_MAX_BYTES),
        allowed_extensions=ALLOWED_DOCUMENT_EXTENSIONS,
        allowed_content_types=ALLOWED_DOCUMENT_CONTENT_TYPES,
        type_error_message=f"{label} должен быть файлом формата PDF, JPG, PNG, GIF или WEBP.",
    )
    return _validate_image_contents(file, label=label)
