import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Navbar } from './navbar/navbar';

@Component({
  selector: 'app-root',
  imports: [FormsModule, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  serviceType = '';
  amount = '';
  calculatedAmountDisplay = '';
  origin = '';
  destination = '';
  calculated = false;
  isCalculating = false;
  calculationMessage = '';
  distanceDisplay = '';
  resolvedOrigin = '';
  resolvedDestination = '';
  private lastRouteRequestAt = 0;

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  async calculate(): Promise<void> {
    const rawAmount = this.amount.trim().replace(/\s/g, '');
    const normalizedAmount = rawAmount.includes(',')
      ? rawAmount.replace(/\./g, '').replace(',', '.')
      : rawAmount;
    const parsedAmount = Number(normalizedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      this.calculationMessage = 'Indica um valor válido em euros.';
      return;
    }

    this.isCalculating = true;
    this.calculated = false;
    this.calculationMessage = 'A localizar a origem…';

    try {
      const origin = await this.geocode(this.origin);
      this.calculationMessage = 'A localizar o destino final…';
      this.changeDetector.markForCheck();
      const destination = await this.geocode(this.destination);
      await this.waitForRouteSlot();

      const [originLon, originLat] = origin.coordinates;
      const [destinationLon, destinationLat] = destination.coordinates;
      const routeUrl = new URL(
        `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destinationLon},${destinationLat}`
      );
      routeUrl.searchParams.set('overview', 'false');
      this.lastRouteRequestAt = Date.now();
      this.calculationMessage = 'A calcular o percurso de carro…';
      this.changeDetector.markForCheck();
      const routeData = await this.fetchJson(routeUrl, {}, 'O serviço de rotas não respondeu.');
      if (routeData.code !== 'Ok') {
        throw new Error('Não foi possível encontrar um percurso de carro entre estes locais.');
      }
      const meters = routeData.routes?.[0]?.distance;
      if (typeof meters !== 'number') {
        throw new Error('Não foi possível encontrar um percurso de carro entre estes locais.');
      }

      const distanceKm = meters / 1000;
      this.distanceDisplay = `${new Intl.NumberFormat('pt-PT', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(distanceKm)} km`;
      this.resolvedOrigin = origin.label;
      this.resolvedDestination = destination.label;
      this.calculatedAmountDisplay = new Intl.NumberFormat('pt-PT', {
        style: 'currency', currency: 'EUR'
      }).format(parsedAmount);
      this.calculated = true;
      this.calculationMessage = '';
      this.changeDetector.markForCheck();
    } catch (error) {
      this.calculationMessage = error instanceof Error
        ? error.message
        : 'Ocorreu um erro ao calcular o percurso. Tenta novamente.';
      this.changeDetector.markForCheck();
    } finally {
      this.isCalculating = false;
      this.changeDetector.markForCheck();
    }
  }

  private async geocode(query: string): Promise<{ coordinates: [number, number]; label: string }> {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', '1');

    const data = await this.fetchJson(url, {}, 'O serviço de pesquisa de locais não respondeu.');
    const feature = data.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error(`Não encontrei o destino “${query}”. Experimenta acrescentar a cidade ou o código postal.`);
    }

    const properties = feature.properties ?? {};
    const label = [
      properties.name,
      properties.housenumber && properties.street
        ? `${properties.street}, ${properties.housenumber}`
        : properties.street,
      properties.postcode,
      properties.city ?? properties.locality ?? properties.county,
      properties.country
    ].filter((part, index, all) => Boolean(part) && all.indexOf(part) === index).join(', ');

    return { coordinates: [coordinates[0], coordinates[1]], label: label || query };
  }

  private async fetchJson(url: RequestInfo | URL, options: RequestInit, timeoutMessage: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('O serviço recebeu demasiados pedidos. Aguarda um pouco e tenta novamente.');
        }
        throw new Error(data.message ?? data.error?.message ?? 'Não foi possível concluir o cálculo.');
      }

      return data;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${timeoutMessage} Tenta novamente dentro de alguns instantes.`);
      }
      if (error instanceof TypeError) {
        throw new Error('Não foi possível contactar os serviços de mapas. Verifica a ligação à Internet.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async waitForRouteSlot(): Promise<void> {
    const waitMs = Math.max(0, 1000 - (Date.now() - this.lastRouteRequestAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
