import { ClientSession, Document, FilterQuery, Model } from 'mongoose';

interface FetchPropI {
  readonly limit?: number;
  readonly page?: number;
  readonly fetchAll?: 'yes' | 'no';
}

export class BaseRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  async create(
    data: Partial<T> | Record<string, unknown>,
    session?: ClientSession,
  ): Promise<T> {
    return new this.model(data).save({ session });
  }

  async findById(
    id: string,
    session?: ClientSession,
  ): Promise<Partial<T> | null> {
    let query = this.model.findById(id);
    if (session) query = query.session(session);
    return query.lean().exec() as any as Partial<T>;
  }

  async findOne(
    filter: FilterQuery<T>,
    session?: ClientSession,
  ): Promise<Partial<T> | null> {
    let query = this.model.findOne(filter);
    if (session) query = query.session(session);
    return query.lean().exec() as any as Partial<T>;
  }

  async update(
    filter: string | FilterQuery<T>,
    data: any,
    session?: ClientSession,
  ): Promise<Partial<T> | null> {
    let query =
      typeof filter === 'string'
        ? this.model.findByIdAndUpdate(filter, data, { new: true })
        : this.model.findOneAndUpdate(filter, data, { new: true });
    if (session) query = query.session(session);
    return (await query.lean().exec()) as any as Partial<T>;
  }

  async delete(id: string, session?: ClientSession): Promise<void> {
    await this.model
      .findByIdAndDelete(id)
      .session(session ?? null)
      .exec();
  }

  async count(filter: FilterQuery<T>): Promise<number> {
    return this.model.countDocuments(filter);
  }

  async search(
    additionalFilters: FilterQuery<T> = {},
    searchTerm?: string,
    fields?: string[],
    fetchProp?: FetchPropI,
    select: string[] = [],
  ): Promise<{ documents: Partial<T>[]; count: number }> {
    const baseQuery: FilterQuery<T> = { ...additionalFilters };

    if (searchTerm && fields?.length) {
      baseQuery['$or'] = fields.map(
        (field) =>
          ({
            [field]: { $regex: searchTerm, $options: 'i' },
          }) as FilterQuery<T>,
      );
    }

    const queryBuilder = this.model.find(baseQuery).sort({ createdAt: -1 });

    if (select.length) {
      queryBuilder.select(select.join(' '));
    }

    if (fetchProp?.fetchAll !== 'yes') {
      const limit = fetchProp?.limit ?? 10;
      const page = fetchProp?.page ?? 1;
      queryBuilder.limit(limit).skip((page - 1) * limit);
    }

    const [documents, count] = await Promise.all([
      queryBuilder.lean().exec(),
      this.model.countDocuments(baseQuery),
    ]);

    return { documents: documents as any as Partial<T>[], count };
  }
}
