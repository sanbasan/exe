type Handler<Args extends readonly unknown[], Result> = (
  ...args: Args
) => Result;

type ValueMap<Key extends string, Value> = Record<Key, Value>;

interface Dispatcher {
  <Key extends string, Value>(map: ValueMap<Key, Value>): (key: Key) => Value;

  <Key extends string, Args extends readonly unknown[], Result>(
    map: ValueMap<Key, Handler<Args, Result>>
  ): (key: Key) => (...args: Args) => Result;
}

/**
 * Creates a type-safe dispatcher from a const string union.
 *
 * Unlike a hard-coded language switch, the key type is generic, so the same
 * helper can branch on `Language` today and on any other string union
 * (additional languages, plan tiers, channels, ...) as the product grows.
 *
 * @example
 * ```ts
 * type Language = 'ja' | 'en';
 *
 * // Value mapping
 * const getHello = dispatcher<Language, string>({
 *   ja: 'こんにちは',
 *   en: 'Hello',
 * });
 * getHello('ja'); // => "こんにちは"
 *
 * // Function mapping
 * const greet = dispatcher<Language, [name: string], string>({
 *   ja: (name) => `こんにちは、${name}さん`,
 *   en: (name) => `Hello, ${name}`,
 * });
 * greet('ja')('Taro'); // => "こんにちは、Taroさん"
 * ```
 */
export const dispatcher: Dispatcher =
  <Key extends string, Value>(
    map: ValueMap<Key, Value>
  ): ((key: Key) => Value) =>
  (key: Key): Value => {
    // Safe: Object.hasOwn() guards against keys outside the provided map.
    if (!Object.hasOwn(map, key)) {
      throw new Error(`Unknown dispatcher key: ${key}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- Object.hasOwn() above validates the dynamic key.
    return map[key];
  };
