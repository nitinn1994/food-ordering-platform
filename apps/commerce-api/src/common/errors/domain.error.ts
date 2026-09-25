// The base class every domain module's own error extends —
// modules/menu/domain/menu.errors.ts's MenuItemNotFoundError is the first.
// A domain error carries the HTTP status and ContractError code it should
// become, as plain data, with no import from @nestjs/common or express:
// AllExceptionsFilter is the one place that turns it into an actual
// response (requirements.md AC5; plan.md OD7). `status` is a plain number,
// not the HttpStatus enum, precisely so the domain layer that throws these
// stays framework-agnostic — a future Cart or Order domain error extends
// this same class rather than each module inventing its own filter branch
// or reaching into HTTP concerns to construct one.
export abstract class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
