import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogService, type CatalogItem } from './catalog.service';

@ApiTags('catalog')
@Controller('services')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Active services with their styles' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: 'yoga' },
          name: { type: 'string' },
          tagline: { type: 'string', nullable: true },
          durationMinMinutes: { type: 'integer' },
          durationMaxMinutes: { type: 'integer' },
          intensity: { type: 'string', nullable: true },
          formats: {
            type: 'array',
            items: {
              type: 'object',
              properties: { slug: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true } },
            },
          },
        },
      },
    },
  })
  list(): Promise<CatalogItem[]> {
    return this.catalog.listServices();
  }
}
