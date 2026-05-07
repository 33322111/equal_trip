const EXACT_ERROR_TRANSLATIONS: Record<string, string> = {
  "Not found.": "Ничего не найдено.",
  "Authentication credentials were not provided.": "Необходима авторизация.",
  "You do not have permission to perform this action.": "У вас нет прав для выполнения этого действия.",
  "No active account found with the given credentials": "Неверное имя пользователя или пароль.",
  "This field is required.": "Это поле обязательно.",
  "This field may not be blank.": "Это поле не может быть пустым.",
  "This field may not be null.": "Это поле не может быть пустым.",
  "A valid integer is required.": "Требуется корректное целое число.",
  "A valid number is required.": "Требуется корректное число.",
  "Enter a valid email address.": "Введите корректный email.",
  "No file was submitted.": "Файл не был передан.",
  "The submitted data was not a file. Check the encoding type on the form.": "Не удалось обработать загруженный файл.",
  "Unsupported media type \"application/json\" in request.": "Неподдерживаемый формат данных в запросе.",
  "Network Error": "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
  "Failed to fetch": "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
  "Only owner can delete trip.": "Только владелец поездки может удалить поездку.",
  "Only owner can edit trip.": "Только владелец поездки может редактировать поездку.",
  "Only owner can invite.": "Только владелец поездки может создавать приглашения.",
  "Only owner can remove members.": "Только владелец поездки может удалять участников.",
  "Cannot remove yourself.": "Нельзя удалить самого себя из поездки.",
  "Cannot remove owner.": "Нельзя удалить владельца поездки.",
  "Owner cannot leave the trip. Transfer ownership or delete the trip.": "Владелец не может покинуть поездку. Сначала передайте права другому участнику или удалите поездку.",
  "Left the trip.": "Вы покинули поездку.",
  "Only owner can add members.": "Только владелец поездки может добавлять участников.",
  "user_id is required.": "Не указан пользователь для добавления.",
  "User not found.": "Пользователь не найден.",
  "User is already a member.": "Пользователь уже состоит в этой поездке.",
  "Member added.": "Участник добавлен.",
  "Invite not found.": "Приглашение не найдено.",
  "Invite already used.": "Это приглашение уже использовано.",
  "Invite expired.": "Срок действия приглашения истёк.",
  "text required": "Текст комментария обязателен.",
  "text is required": "Текст комментария обязателен.",
  "Assignee must be trip member.": "Ответственный должен быть участником поездки.",
  "Assignee must be a trip member.": "Ответственный должен быть участником поездки.",
  "You can only create a payment from your own account.": "Можно создавать оплату только от своего имени.",
  "Users must be members of the trip": "Оба пользователя должны состоять в поездке.",
  "Only payer or trip owner can delete payment.": "Удалить оплату может только плательщик или владелец поездки.",
  "Only receiver can confirm payment": "Подтвердить оплату может только получатель.",
  "from_user and to_user must be different": "Плательщик и получатель должны быть разными пользователями.",
  "amount must be > 0": "Сумма оплаты должна быть больше нуля.",
  "Some users are not members of the trip.": "Некоторые выбранные пользователи не состоят в поездке.",
};

export function translateErrorMessage(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return translateErrorMessage(value[0]);
  }
  if (value == null) return undefined;

  const message = String(value).trim();
  if (!message) return undefined;

  if (EXACT_ERROR_TRANSLATIONS[message]) {
    return EXACT_ERROR_TRANSLATIONS[message];
  }

  if (/^Method ".+" not allowed\.$/.test(message)) {
    return "Это действие не поддерживается.";
  }

  if (/^Request failed with status code 5\d\d$/.test(message)) {
    return "На сервере произошла ошибка. Попробуйте еще раз чуть позже.";
  }

  return message;
}

export function extractApiErrorMessage(
  error: any,
  fallback: string,
  fields: string[] = [],
): string {
  const data = error?.response?.data;

  for (const field of fields) {
    const translatedFieldMessage = translateErrorMessage(data?.[field]);
    if (translatedFieldMessage) {
      return translatedFieldMessage;
    }
  }

  const translatedDetail = translateErrorMessage(data?.detail);
  if (translatedDetail) {
    return translatedDetail;
  }

  const translatedNonFieldErrors = translateErrorMessage(data?.non_field_errors);
  if (translatedNonFieldErrors) {
    return translatedNonFieldErrors;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (key === "detail" || key === "non_field_errors" || fields.includes(key)) continue;
      const translatedFieldMessage = translateErrorMessage(value);
      if (translatedFieldMessage) {
        return translatedFieldMessage;
      }
    }
  }

  return translateErrorMessage(error?.message) || fallback;
}
