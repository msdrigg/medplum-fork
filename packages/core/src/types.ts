import {
  Bundle,
  BundleEntry,
  ElementDefinition,
  Resource,
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import baseSchema from './base-schema.json';
import { SearchParameterDetails } from './searchparams';
import { capitalize } from './utils';

export interface TypedValue {
  readonly type: string;
  readonly value: any;
}

/**
 * List of property types.
 * http://www.hl7.org/fhir/valueset-defined-types.html
 * The list here includes additions found from StructureDefinition resources.
 */
export enum PropertyType {
  Address = 'Address',
  Age = 'Age',
  Annotation = 'Annotation',
  Attachment = 'Attachment',
  BackboneElement = 'BackboneElement',
  CodeableConcept = 'CodeableConcept',
  Coding = 'Coding',
  ContactDetail = 'ContactDetail',
  ContactPoint = 'ContactPoint',
  Contributor = 'Contributor',
  Count = 'Count',
  DataRequirement = 'DataRequirement',
  Distance = 'Distance',
  Dosage = 'Dosage',
  Duration = 'Duration',
  Expression = 'Expression',
  Extension = 'Extension',
  HumanName = 'HumanName',
  Identifier = 'Identifier',
  MarketingStatus = 'MarketingStatus',
  Meta = 'Meta',
  Money = 'Money',
  Narrative = 'Narrative',
  ParameterDefinition = 'ParameterDefinition',
  Period = 'Period',
  Population = 'Population',
  ProdCharacteristic = 'ProdCharacteristic',
  ProductShelfLife = 'ProductShelfLife',
  Quantity = 'Quantity',
  Range = 'Range',
  Ratio = 'Ratio',
  Reference = 'Reference',
  RelatedArtifact = 'RelatedArtifact',
  SampledData = 'SampledData',
  Signature = 'Signature',
  SubstanceAmount = 'SubstanceAmount',
  SystemString = 'http://hl7.org/fhirpath/System.String',
  Timing = 'Timing',
  TriggerDefinition = 'TriggerDefinition',
  UsageContext = 'UsageContext',
  base64Binary = 'base64Binary',
  boolean = 'boolean',
  canonical = 'canonical',
  code = 'code',
  date = 'date',
  dateTime = 'dateTime',
  decimal = 'decimal',
  id = 'id',
  instant = 'instant',
  integer = 'integer',
  markdown = 'markdown',
  oid = 'oid',
  positiveInt = 'positiveInt',
  string = 'string',
  time = 'time',
  unsignedInt = 'unsignedInt',
  uri = 'uri',
  url = 'url',
  uuid = 'uuid',
}

/**
 * An IndexedStructureDefinition is a lookup-optimized version of a StructureDefinition.
 *
 * StructureDefinition resources contain schema information for other resource types.
 * These schemas can be used to automatically generate user interface elements for
 * resources.
 *
 * However, a StructureDefinition resource is not optimized for realtime lookups.  All
 * resource types, sub types, and property definitions are stored in a flat array of
 * ElementDefinition objects.  Therefore, to lookup the schema for a property (i.e., "Patient.name")
 * requires a linear scan of all ElementDefinition objects
 *
 * A StructureDefinition resource contains information about one or more types.
 * For example, the "Patient" StructureDefinition includes "Patient", "Patient_Contact",
 * "Patient_Communication", and "Patient_Link".  This is inefficient.
 *
 * Instead, we create an indexed version of the StructureDefinition, called IndexedStructureDefinition.
 * In an IndexedStructureDefinition, retrieving a property definition is a hashtable lookup.
 *
 * The hierarchy is:
 *   IndexedStructureDefinition - top level for one resource type
 *   TypeSchema - one per resource type and all contained BackboneElements
 *   PropertySchema - one per property/field
 */
export interface IndexedStructureDefinition {
  types: { [resourceType: string]: TypeSchema };
}

/**
 * An indexed TypeSchema.
 *
 * Example:  The IndexedStructureDefinition for "Patient" would include the following TypeSchemas:
 *   1) Patient
 *   2) Patient_Contact
 *   3) Patient_Communication
 *   4) Patient_Link
 */
export interface TypeSchema {
  structureDefinition: StructureDefinition;
  elementDefinition: ElementDefinition;
  display: string;
  properties: { [name: string]: ElementDefinition };
  searchParams?: { [code: string]: SearchParameter };
  searchParamsDetails?: { [code: string]: SearchParameterDetails };
  description?: string;
  parentType?: string;
}

/**
 * Creates a new empty IndexedStructureDefinition.
 * @returns The empty IndexedStructureDefinition.
 * @deprecated Use globalSchema
 */
export function createSchema(): IndexedStructureDefinition {
  return { types: {} };
}

function createTypeSchema(
  typeName: string,
  structureDefinition: StructureDefinition,
  elementDefinition: ElementDefinition
): TypeSchema {
  return {
    structureDefinition,
    elementDefinition,
    display: typeName,
    description: elementDefinition.definition,
    properties: {},
  };
}

/**
 * Indexes a bundle of StructureDefinitions for faster lookup.
 * @param bundle A FHIR bundle StructureDefinition resources.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexStructureDefinitionBundle(bundle: Bundle): void {
  for (const entry of bundle.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition') {
      indexStructureDefinition(resource);
    }
  }
}

/**
 * Indexes a StructureDefinition for fast lookup.
 * @param structureDefinition The original StructureDefinition.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexStructureDefinition(structureDefinition: StructureDefinition): void {
  const typeName = structureDefinition.name;
  if (!typeName) {
    return;
  }

  const elements = structureDefinition.snapshot?.element;
  if (elements) {
    // First pass, build types
    elements.forEach((element) => indexType(structureDefinition, element));

    // Second pass, build properties
    elements.forEach((element) => indexProperty(element));
  }
}

/**
 * Indexes TypeSchema from an ElementDefinition.
 * In the common case, there will be many ElementDefinition instances per TypeSchema.
 * Only the first occurrence is saved.
 * @param structureDefinition The parent type structure definition.
 * @param elementDefinition The element definition.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
function indexType(structureDefinition: StructureDefinition, elementDefinition: ElementDefinition): void {
  const path = elementDefinition.path as string;
  const typeCode = elementDefinition.type?.[0]?.code;
  if (typeCode !== undefined && typeCode !== 'Element' && typeCode !== 'BackboneElement') {
    return;
  }
  const parts = path.split('.');
  const typeName = buildTypeName(parts);
  globalSchema.types[typeName] = createTypeSchema(typeName, structureDefinition, elementDefinition);
  globalSchema.types[typeName].parentType = buildTypeName(parts.slice(0, parts.length - 1));
}

/**
 * Indexes PropertySchema from an ElementDefinition.
 * @param element The input ElementDefinition.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
function indexProperty(element: ElementDefinition): void {
  const path = element.path as string;
  const parts = path.split('.');
  if (parts.length === 1) {
    return;
  }
  const typeName = buildTypeName(parts.slice(0, parts.length - 1));
  const typeSchema = globalSchema.types[typeName];
  if (!typeSchema) {
    return;
  }
  const key = parts[parts.length - 1];
  typeSchema.properties[key] = element;
}

/**
 * Indexes a bundle of SearchParameter resources for faster lookup.
 * @param bundle A FHIR bundle SearchParameter resources.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexSearchParameterBundle(bundle: Bundle<SearchParameter>): void {
  for (const entry of bundle.entry as BundleEntry[]) {
    const resource = entry.resource as SearchParameter;
    if (resource.resourceType === 'SearchParameter') {
      indexSearchParameter(resource);
    }
  }
}

/**
 * Indexes a SearchParameter resource for fast lookup.
 * Indexes by SearchParameter.code, which is the query string parameter name.
 * @param searchParam The SearchParameter resource.
 * @see {@link IndexedStructureDefinition} for more details on indexed StructureDefinitions.
 */
export function indexSearchParameter(searchParam: SearchParameter): void {
  if (!searchParam.base) {
    return;
  }

  for (const resourceType of searchParam.base) {
    const typeSchema = globalSchema.types[resourceType];
    if (!typeSchema) {
      continue;
    }

    if (!typeSchema.searchParams) {
      typeSchema.searchParams = {
        _id: {
          base: [resourceType],
          code: '_id',
          type: 'token',
          expression: resourceType + '.id',
        } as SearchParameter,
        _lastUpdated: {
          base: [resourceType],
          code: '_lastUpdated',
          type: 'date',
          expression: resourceType + '.meta.lastUpdated',
        } as SearchParameter,
        _compartment: {
          base: [resourceType],
          code: '_compartment',
          type: 'reference',
          expression: resourceType + '.meta.compartment',
        } as SearchParameter,
      };
    }

    typeSchema.searchParams[searchParam.code as string] = searchParam;
  }
}

export function buildTypeName(components: string[]): string {
  if (components.length === 1) {
    return components[0];
  }
  return components.map(capitalize).join('');
}

export function getPropertyDisplayName(path: string): string {
  // Get the property name, which is the remainder after the last period
  // For example, for path "Patient.birthDate"
  // the property name is "birthDate"
  const propertyName = path.replaceAll('[x]', '').split('.').pop() as string;

  // Special case for ID
  if (propertyName === 'id') {
    return 'ID';
  }

  // Split by capital letters
  // Capitalize the first letter of each word
  // Join together with spaces in between
  // Then normalize whitespace to single space character
  // For example, for property name "birthDate",
  // the display name is "Birth Date".
  return propertyName
    .split(/(?=[A-Z])/)
    .map(capitalize)
    .join(' ')
    .replace('_', ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Returns an element definition by type and property name.
 * Handles content references.
 * @param typeName The type name.
 * @param propertyName The property name.
 * @returns The element definition if found.
 */
export function getElementDefinition(typeName: string, propertyName: string): ElementDefinition | undefined {
  const typeSchema = globalSchema.types[typeName];
  if (!typeSchema) {
    return undefined;
  }

  const property = typeSchema.properties[propertyName] ?? typeSchema.properties[propertyName + '[x]'];
  if (!property) {
    return undefined;
  }

  if (property.contentReference) {
    // Content references start with a "#"
    // Remove the "#" character
    const contentReference = property.contentReference.substring(1).split('.');
    const referencePropertyName = contentReference.pop() as string;
    const referenceTypeName = buildTypeName(contentReference);
    return getElementDefinition(referenceTypeName, referencePropertyName);
  }

  return property;
}

/**
 * Global schema singleton.
 */
export const globalSchema = baseSchema as unknown as IndexedStructureDefinition;
