import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import '@/shared/config/i18n';
import { MapPointPicker } from './MapPointPicker';

// Leaflet manipula el DOM real con medidas de layout que jsdom no calcula (tamaño de contenedor,
// paneo por píxeles). Se sustituye por un doble mínimo que registra sus llamadas — lo que este
// test verifica es el cableado del componente (qué evento dispara qué `onChange`), no el motor
// de renderizado del mapa.
vi.mock('leaflet', () => {
  class FakeHandler {
    enabled = true;
    enable() {
      this.enabled = true;
    }
    disable() {
      this.enabled = false;
    }
  }

  class FakeMarker {
    dragging = new FakeHandler();
    private handlers: Record<string, Array<() => void>> = {};
    private latlng: { lat: number; lng: number };

    constructor(latlng: [number, number]) {
      this.latlng = { lat: latlng[0], lng: latlng[1] };
    }

    addTo() {
      return this;
    }

    on(event: string, callback: () => void) {
      (this.handlers[event] ??= []).push(callback);
      return this;
    }

    setLatLng(latlng: [number, number]) {
      this.latlng = { lat: latlng[0], lng: latlng[1] };
    }

    getLatLng() {
      return this.latlng;
    }

    remove() {}

    dragTo(lat: number, lng: number) {
      this.latlng = { lat, lng };
      this.handlers.dragend?.forEach((callback) => callback());
    }
  }

  class FakeTileLayer {
    addTo() {
      return this;
    }
  }

  class FakeMap {
    dragging = new FakeHandler();
    doubleClickZoom = new FakeHandler();
    scrollWheelZoom = new FakeHandler();
    boxZoom = new FakeHandler();
    keyboard = new FakeHandler();
    touchZoom = new FakeHandler();
    private handlers: Record<string, Array<(event: unknown) => void>> = {};

    on(event: string, callback: (event: unknown) => void) {
      (this.handlers[event] ??= []).push(callback);
      return this;
    }

    panTo() {}

    setView = vi.fn();

    getZoom() {
      return 6;
    }

    getBounds() {
      return { toBBoxString: () => '-79,-1,-78,0' };
    }

    invalidateSize() {}

    remove() {}

    fireClick(lat: number, lng: number) {
      this.handlers.click?.forEach((callback) => callback({ latlng: { lat, lng } }));
    }
  }

  return {
    default: {
      map: vi.fn(() => new FakeMap()),
      tileLayer: vi.fn(() => new FakeTileLayer()),
      marker: vi.fn((latlng: [number, number]) => new FakeMarker(latlng)),
      Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    },
  };
});

function lastMarker() {
  return vi.mocked(L.marker).mock.results.at(-1)?.value as {
    dragTo: (lat: number, lng: number) => void;
    getLatLng: () => { lat: number; lng: number };
  };
}

function lastMap() {
  return vi.mocked(L.map).mock.results.at(-1)?.value as {
    fireClick: (lat: number, lng: number) => void;
    setView: ReturnType<typeof vi.fn>;
  };
}

describe('MapPointPicker', () => {
  it('arrastrar el marcador emite el valor redondeado a 7 decimales', () => {
    const onChange = vi.fn();
    render(
      <MapPointPicker
        value={{ lat: -0.18, lng: -78.46 }}
        onChange={onChange}
        ariaLabel="Lugar de vacunación"
      />,
    );

    lastMarker().dragTo(-0.1807123456, -78.4678987654);

    expect(onChange).toHaveBeenCalledWith({ lat: -0.1807123, lng: -78.4678988 });
  });

  it('escribir en los campos numéricos mueve el marcador — mismo valor que arrastrar', () => {
    const onChange = vi.fn();
    render(
      <MapPointPicker
        value={{ lat: -0.18, lng: -78.46 }}
        onChange={onChange}
        ariaLabel="Lugar de vacunación"
      />,
    );

    fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '-0.1807123456' } });

    expect(onChange).toHaveBeenLastCalledWith({ lat: -0.1807123, lng: -78.46 });
  });

  it('un clic en el mapa fija el punto cuando no había ninguno', () => {
    const onChange = vi.fn();
    render(<MapPointPicker value={null} onChange={onChange} ariaLabel="Lugar de vacunación" />);

    lastMap().fireClick(-0.2, -78.5);

    expect(onChange).toHaveBeenCalledWith({ lat: -0.2, lng: -78.5 });
  });

  it('el botón "Borrar punto" vuelve las dos columnas a null', () => {
    const onChange = vi.fn();
    render(
      <MapPointPicker
        value={{ lat: -0.18, lng: -78.46 }}
        onChange={onChange}
        ariaLabel="Lugar de vacunación"
      />,
    );

    screen.getByRole('button', { name: 'Borrar punto' }).click();

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('disabled no admite interacción: sin botón de borrar y sin clic en el mapa', () => {
    const onChange = vi.fn();
    render(
      <MapPointPicker
        value={{ lat: -0.18, lng: -78.46 }}
        onChange={onChange}
        ariaLabel="Lugar de vacunación"
        disabled
      />,
    );

    expect(screen.queryByRole('button', { name: 'Borrar punto' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Latitud')).toBeDisabled();

    lastMap().fireClick(-0.3, -78.7);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sin value, el mapa se centra en el fallbackCenter', () => {
    const onChange = vi.fn();
    render(
      <MapPointPicker
        value={null}
        onChange={onChange}
        ariaLabel="Lugar de vacunación"
        fallbackCenter={{ lat: 1, lng: 2 }}
      />,
    );

    expect(vi.mocked(L.map)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ center: [1, 2] }),
    );
  });
  it('un clic sobre una copia repetida del mundo envuelve la longitud, no la recorta a ±180', () => {
    const onChange = vi.fn();
    render(<MapPointPicker value={null} onChange={onChange} ariaLabel="Localidad del paciente" />);

    lastMap().fireClick(-2.9, -439.0);

    expect(onChange).toHaveBeenCalledWith({ lat: -2.9, lng: -79 });
  });

  it('arrastrar el marcador sobre una copia repetida también envuelve la longitud', () => {
    const onChange = vi.fn();
    render(
      <MapPointPicker value={{ lat: -0.18, lng: -78.46 }} onChange={onChange} ariaLabel="Localidad del paciente" />,
    );

    lastMarker().dragTo(-0.18, 281.54);

    expect(onChange).toHaveBeenLastCalledWith({ lat: -0.18, lng: -78.46 });
  });

  it('sin value, un fallbackCenter que llega después del montaje recentra el mapa', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MapPointPicker value={null} onChange={onChange} ariaLabel="Localidad del paciente" />,
    );

    rerender(
      <MapPointPicker
        value={null}
        onChange={onChange}
        ariaLabel="Localidad del paciente"
        fallbackCenter={{ lat: -2.9, lng: -79 }}
      />,
    );

    expect(lastMap().setView).toHaveBeenCalledWith([-2.9, -79], 6);
  });

  it('con value, un fallbackCenter tardío no mueve el mapa', () => {
    const onChange = vi.fn();
    const value = { lat: -0.18, lng: -78.46 };
    const { rerender } = render(
      <MapPointPicker value={value} onChange={onChange} ariaLabel="Localidad del paciente" />,
    );

    rerender(
      <MapPointPicker
        value={value}
        onChange={onChange}
        ariaLabel="Localidad del paciente"
        fallbackCenter={{ lat: -2.9, lng: -79 }}
      />,
    );

    expect(lastMap().setView).not.toHaveBeenCalled();
  });

  it('buscar con Enter consulta el geocodificador, y elegir un resultado fija el punto y centra el mapa', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ place_id: 1, display_name: 'Julio Andrade, Carchi, Ecuador', lat: '0.6583', lon: '-77.7039' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<MapPointPicker value={null} onChange={onChange} ariaLabel="Lugar de vacunación" />);

    const input = screen.getByRole('searchbox', { name: 'Buscar dirección en el mapa' });
    fireEvent.change(input, { target: { value: 'Julio Andrade' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const result = await screen.findByRole('button', { name: 'Julio Andrade, Carchi, Ecuador' });
    const requested = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(requested.searchParams.get('q')).toBe('Julio Andrade');
    expect(requested.searchParams.get('viewbox')).toBe('-79,-1,-78,0');

    fireEvent.click(result);

    expect(onChange).toHaveBeenCalledWith({ lat: 0.6583, lng: -77.7039 });
    expect(lastMap().setView).toHaveBeenCalledWith([0.6583, -77.7039], 17);
    vi.unstubAllGlobals();
  });

  it('un fallo del geocodificador se muestra como aviso, no como «sin resultados»', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MapPointPicker value={null} onChange={vi.fn()} ariaLabel="Lugar de vacunación" />);

    const input = screen.getByRole('searchbox', { name: 'Buscar dirección en el mapa' });
    fireEvent.change(input, { target: { value: 'Quito' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo consultar el buscador de direcciones'),
    );
    vi.unstubAllGlobals();
  });

  it('en modo solo lectura no muestra el buscador', () => {
    render(<MapPointPicker value={null} onChange={vi.fn()} disabled ariaLabel="Lugar de vacunación" />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
