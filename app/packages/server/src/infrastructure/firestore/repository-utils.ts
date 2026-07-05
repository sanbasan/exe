import type {
  DocumentData,
  Firestore,
  Query,
  QuerySnapshot,
} from 'firebase-admin/firestore';

interface SafeParseFailure {
  readonly success: false;
}

interface SafeParseSuccess<Value> {
  readonly data: Value;
  readonly success: true;
}

interface SafeParser<Value> {
  readonly safeParse: (
    value: unknown
  ) => SafeParseFailure | SafeParseSuccess<Value>;
}

const FIRESTORE_IN_LIMIT = 30;

export const parseOrNull = <Value>({
  schema,
  value,
}: {
  readonly schema: SafeParser<Value>;
  readonly value: unknown;
}): Value | null => {
  const result = schema.safeParse(value);

  if (!result.success) {
    return null;
  }

  return result.data;
};

export const chunk = <Value>(
  values: readonly Value[],
  size = FIRESTORE_IN_LIMIT
): readonly (readonly Value[])[] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_value, index) =>
    values.slice(index * size, (index + 1) * size)
  );

export const parseSnapshot = <Value>({
  schema,
  snapshot,
}: {
  readonly schema: SafeParser<Value>;
  readonly snapshot: QuerySnapshot;
}): readonly Value[] =>
  snapshot.docs
    .map((document) => parseOrNull({ schema, value: document.data() }))
    .filter((value): value is Value => value !== null);

export const getDocument = async <Value>({
  firestore,
  path,
  schema,
}: {
  readonly firestore: Firestore;
  readonly path: string;
  readonly schema: SafeParser<Value>;
}): Promise<Value | null> => {
  const snapshot = await firestore.doc(path).get();
  const data = snapshot.data();

  if (data === undefined) {
    return null;
  }

  return parseOrNull({ schema, value: data });
};

export const listCollection = async <Value>({
  firestore,
  path,
  schema,
}: {
  readonly firestore: Firestore;
  readonly path: string;
  readonly schema: SafeParser<Value>;
}): Promise<readonly Value[]> => {
  const snapshot = await firestore.collection(path).get();

  return parseSnapshot({ schema, snapshot });
};

export const queryCollection = async <Value>({
  firestore,
  path,
  query,
  schema,
}: {
  readonly firestore: Firestore;
  readonly path: string;
  readonly query: (collection: Query) => Query;
  readonly schema: SafeParser<Value>;
}): Promise<readonly Value[]> => {
  const snapshot = await query(firestore.collection(path)).get();

  return parseSnapshot({ schema, snapshot });
};

export const queryCollectionGroup = async <Value>({
  collectionId,
  firestore,
  query,
  schema,
}: {
  readonly collectionId: string;
  readonly firestore: Firestore;
  readonly query: (collection: Query) => Query;
  readonly schema: SafeParser<Value>;
}): Promise<readonly Value[]> => {
  const snapshot = await query(firestore.collectionGroup(collectionId)).get();

  return parseSnapshot({ schema, snapshot });
};

const toDocumentData = (value: unknown): DocumentData =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Firestore SDK requires DocumentData; domain repositories only pass schema-validated plain objects.
  value as DocumentData;

export const createDocument = async ({
  firestore,
  path,
  value,
}: {
  readonly firestore: Firestore;
  readonly path: string;
  readonly value: unknown;
}): Promise<void> => {
  await firestore.doc(path).create(toDocumentData(value));
};

export const deleteDocument = async ({
  firestore,
  path,
}: {
  readonly firestore: Firestore;
  readonly path: string;
}): Promise<void> => {
  await firestore.doc(path).delete();
};

export const setDocument = async ({
  firestore,
  path,
  value,
}: {
  readonly firestore: Firestore;
  readonly path: string;
  readonly value: unknown;
}): Promise<void> => {
  await firestore.doc(path).set(toDocumentData(value), { merge: true });
};

// Full replace, NOT a merge: callers pass complete schema-validated documents,
// and omitting an optional key must delete the stored field (a merge write
// keeps it, which left e.g. removed task due dates alive in Firestore). Use
// setDocument for partial merge writes.
export const updateDocument = async ({
  firestore,
  path,
  value,
}: {
  readonly firestore: Firestore;
  readonly path: string;
  readonly value: unknown;
}): Promise<void> => {
  await firestore.doc(path).set(toDocumentData(value));
};
