import { describe, expect, it } from "vitest";

import { extractApiErrorMessage, translateErrorMessage } from "./errorMessages";

describe("errorMessages", () => {
  it("translates exact backend messages", () => {
    expect(translateErrorMessage("Enter a valid email address.")).toBe("Введите корректный email.");
    expect(translateErrorMessage("Only owner can invite.")).toBe("Только владелец поездки может создавать приглашения.");
  });

  it("translates method and 5xx generic messages", () => {
    expect(translateErrorMessage('Method "PATCH" not allowed.')).toBe("Это действие не поддерживается.");
    expect(translateErrorMessage("Request failed with status code 500")).toBe(
      "На сервере произошла ошибка. Попробуйте еще раз чуть позже."
    );
  });

  it("extracts field-specific API message before fallback", () => {
    const error = {
      response: {
        data: {
          username: ["This field is required."],
          detail: "Network Error",
        },
      },
    };

    expect(extractApiErrorMessage(error, "Ошибка", ["username"])).toBe("Это поле обязательно.");
  });

  it("falls back to translated generic error message", () => {
    const error = {
      message: "Network Error",
    };

    expect(extractApiErrorMessage(error, "Ошибка")).toBe(
      "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова."
    );
  });
});
