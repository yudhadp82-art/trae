export type Context7LibrarySearchResult = {
  id: string;
  title: string;
  description?: string;
};

export type Context7LibrarySearchResponse = {
  results?: Context7LibrarySearchResult[];
};

export type Context7CodeBlock = {
  language?: string;
  code: string;
};

export type Context7CodeSnippet = {
  codeTitle?: string;
  codeDescription?: string;
  codeLanguage?: string;
  pageTitle?: string;
  codeList?: Context7CodeBlock[];
};

export type Context7InfoSnippet = {
  pageId?: string;
  breadcrumb?: string;
  content: string;
};

export type Context7ContextResponse = {
  codeSnippets?: Context7CodeSnippet[];
  infoSnippets?: Context7InfoSnippet[];
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function searchContext7Libraries(libraryName: string, query?: string) {
  const params = new URLSearchParams({ libraryName });
  if (query) {
    params.set('query', query);
  }

  const response = await fetch(`/api/context7/search?${params.toString()}`);
  return readJson<Context7LibrarySearchResponse>(response);
}

export async function getContext7Documentation(input: {
  libraryId: string;
  query: string;
  type?: 'code' | 'docs';
}) {
  const params = new URLSearchParams({
    libraryId: input.libraryId,
    query: input.query,
  });

  if (input.type) {
    params.set('type', input.type);
  }

  const response = await fetch(`/api/context7/context?${params.toString()}`);
  return readJson<Context7ContextResponse>(response);
}
