/** Compact generation result and network construction summary. */
import type { CityBlueprint } from '../../../schema/blueprint';
import { el } from '../components/dom';

export class BlueprintOverview {
  readonly root: HTMLElement;
  private readonly content: HTMLElement;

  constructor() {
    this.content = el('div', { class: 'overview-content' }, [el('p', { class: 'inspector-empty', text: 'Generate a city to see its blueprint counts.' })]);
    this.root = el('section', { class: 'blueprint-overview' }, [
      el('div', { class: 'panel-title' }, [
        el('div', {}, [el('p', { class: 'eyebrow', text: 'Current result' }), el('h3', { text: 'Blueprint summary' })]),
      ]),
      this.content,
    ]);
  }

  setBlueprint(blueprint: CityBlueprint): void {
    const highways = blueprint.streets.highwayStructures;
    const ramps = highways.reduce((sum, item) => sum + Number(item.ramps.start > 0) + Number(item.ramps.end > 0), 0);
    const supports = highways.reduce((sum, item) => sum + item.supports.length, 0);
    const accessRoutes = blueprint.transit.subwayStations.reduce((sum, station) => sum + station.accessPaths.length, 0);
    this.content.replaceChildren(
      el('div', { class: 'summary-grid' }, [
        metric(blueprint.stats.population.toLocaleString(), 'Population'),
        metric(String(blueprint.parcels.length), 'Parcels'),
        metric(String(blueprint.districts.length), 'Districts'),
        metric(String(blueprint.blocks.length), 'Blocks'),
      ]),
      el('div', { class: 'network-summary' }, [
        row('Highway', `${highways.length} runs · ${ramps} ramps · ${supports} supports`),
        row('Train', `${blueprint.transit.trainLines.length} lines · ${blueprint.transit.trainStations.length} stations`),
        row('Subway', `${blueprint.transit.subwayLines.length} lines · ${blueprint.transit.subwayStations.length} stations · ${accessRoutes} access routes`),
        row('Bus', `${blueprint.transit.busRoutes.length} routes · ${blueprint.transit.busStops.length} stops`),
      ]),
    );
  }
}

function metric(value: string, label: string): HTMLElement {
  return el('div', { class: 'summary-metric' }, [el('strong', { text: value }), el('span', { text: label })]);
}

function row(label: string, value: string): HTMLElement {
  return el('div', { class: 'network-row' }, [el('strong', { text: label }), el('span', { text: value })]);
}
