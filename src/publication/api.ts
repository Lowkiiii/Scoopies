import { ingredientDependsOn } from './dependency';
import {
  closePublishProductModal,
  openPublishProductModal,
  renderPublishProductModal,
} from './modal';
import {
  deleteCostingProduct,
  explainPublishedProductDelete,
  publishProductToPos,
  waitForCostingSync,
} from './operation';
import { posPublicationHtml, publicationStatusFor } from './status';

export const PUBLICATION_API = {
  publicationStatusFor,
  posPublicationHtml,
  openPublishProductModal,
  closePublishProductModal,
  renderPublishProductModal,
  waitForCostingSync,
  publishProductToPos,
  explainPublishedProductDelete,
  deleteCostingProduct,
  ingredientDependsOn,
};
