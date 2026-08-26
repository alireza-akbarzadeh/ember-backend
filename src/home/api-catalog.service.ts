import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

export interface ApiEndpoint {
  method: string;
  path: string;
  summary?: string;
  secured: boolean;
}

export interface ApiGroup {
  name: string;
  endpoints: ApiEndpoint[];
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * The route list shown on the home page, read from the generated OpenAPI
 * document rather than written by hand.
 *
 * A hand-maintained list is wrong the first time someone adds an endpoint and
 * forgets to update it; this one cannot drift, because it is the same document
 * Swagger UI renders. It is populated in `main.ts` whether or not the UI is
 * mounted, so the home page still lists routes in production.
 */
@Injectable()
export class ApiCatalogService {
  private groups: ApiGroup[] = [];

  loadFrom(document: OpenAPIObject): void {
    const byTag = new Map<string, ApiEndpoint[]>();

    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of METHODS) {
        const operation = item[method];
        if (!operation) continue;

        // Endpoints marked @ApiExcludeEndpoint (the home page itself) never
        // reach the document, so they cannot list themselves.
        const tag = operation.tags?.[0] ?? 'other';
        const endpoints = byTag.get(tag) ?? [];

        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: operation.summary,
          // @ApiBearerAuth() populates `security`; @Public() routes have none.
          secured: (operation.security?.length ?? 0) > 0,
        });

        byTag.set(tag, endpoints);
      }
    }

    this.groups = [...byTag].map(([name, endpoints]) => ({ name, endpoints }));
  }

  list(): ApiGroup[] {
    return this.groups;
  }

  count(): number {
    return this.groups.reduce((total, group) => total + group.endpoints.length, 0);
  }
}
