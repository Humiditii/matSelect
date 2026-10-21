import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/baseRepository.repository';
import { Selection, SelectionDocument } from '../schema/selection.schema';

@Injectable()
export class SelectionRepository extends BaseRepository<SelectionDocument> {
  constructor(
    @InjectModel(Selection.name)
    private selectionModel: Model<SelectionDocument>,
  ) {
    super(selectionModel);
  }
}
