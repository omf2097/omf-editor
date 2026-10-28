export class OmfFormatError extends Error {
  readonly offset: number | undefined;

  constructor(message: string, offset?: number) {
    super(offset === undefined ? message : `${message} (at offset ${offset})`);
    this.name = 'OmfFormatError';
    this.offset = offset;
  }
}

export class OmfRangeError extends OmfFormatError {
  readonly field: string | undefined;
  readonly value: number;

  constructor(value: number, min: number, max: number, field?: string) {
    super(`${field ?? 'value'} = ${value} is outside ${min}..${max}`);
    this.name = 'OmfRangeError';
    this.field = field;
    this.value = value;
  }
}
