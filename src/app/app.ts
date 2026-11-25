import { Component } from '@angular/core';
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

  calculate(): void {
    const rawAmount = this.amount.trim().replace(/\s/g, '');
    const normalizedAmount = rawAmount.includes(',')
      ? rawAmount.replace(/\./g, '').replace(',', '.')
      : rawAmount;
    const parsedAmount = Number(normalizedAmount);

    this.calculated = Number.isFinite(parsedAmount);
    this.calculatedAmountDisplay = this.calculated
      ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(parsedAmount)
      : '';
  }
}
