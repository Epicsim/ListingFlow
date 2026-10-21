import type { FieldErrors } from "./validation";

/** Result returned by every form server action. */
export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
}

export const success = (message?: string): ActionState => ({ ok: true, message });
export const failure = (message: string, fieldErrors?: FieldErrors): ActionState => ({
  ok: false,
  message,
  fieldErrors,
});
