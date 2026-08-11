import { Inject, Injectable } from '@nestjs/common';
import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import {
  PublicProfessionalReadPort,
  PublicProfessionalReadPortToken,
} from '../ports/public-professional-read.port';

@Injectable()
export class PublicProfessionalService {
  constructor(
    @Inject(PublicProfessionalReadPortToken)
    private readonly reader: PublicProfessionalReadPort,
  ) {}

  async getById(id: string) {
    const professional = await this.reader.findById(id);
    if (!professional) {
      throw new ProfessionalNotFoundError();
    }
    return professional;
  }
}
