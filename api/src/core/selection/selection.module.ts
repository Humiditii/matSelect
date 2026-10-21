import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExplanationModule } from '../explanation/explanation.module';
import { LlmModule } from '../llm/llm.module';
import { MaterialModule } from '../material/material.module';
import { SelectionRepository } from './repository/selection.repository';
import { Selection, SelectionSchema } from './schema/selection.schema';
import { SelectionController } from './selection.controller';
import { SelectionService } from './selection.service';

@Module({
  controllers: [SelectionController],
  providers: [SelectionRepository, SelectionService],
  imports: [
    MongooseModule.forFeature([
      {
        name: Selection.name,
        schema: SelectionSchema,
      },
    ]),
    LlmModule,
    MaterialModule,
    ExplanationModule,
  ],
})
export class SelectionModule {}
