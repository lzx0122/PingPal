<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  MapChart,
  ScatterChart,
  EffectScatterChart,
  LinesChart,
} from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  GeoComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import worldMapData from "@/assets/world.json";

use([
  CanvasRenderer,
  MapChart,
  ScatterChart,
  EffectScatterChart,
  LinesChart,
  TitleComponent,
  TooltipComponent,
  GeoComponent,
]);

const props = withDefaults(
  defineProps<{
    vpnLocation: [number, number] | null;
    regionLabel?: string;
    clientLocation: [number, number] | null;
    clientLabel?: string;
    clientGeoLoading?: boolean;
    clientGeoError?: string | null;
  }>(),
  {
    regionLabel: "",
    clientLabel: "",
    clientGeoLoading: false,
    clientGeoError: null,
  },
);

const hasVpnPoint = computed(() => {
  const loc = props.vpnLocation;
  if (!loc) return false;
  const [lon, lat] = loc;
  if (lon === 0 && lat === 0) return false;
  return Number.isFinite(lon) && Number.isFinite(lat);
});

const hasClientPoint = computed(() => {
  const loc = props.clientLocation;
  if (!loc) return false;
  const [lon, lat] = loc;
  if (lon === 0 && lat === 0) return false;
  return Number.isFinite(lon) && Number.isFinite(lat);
});

const vpnLngLat = computed((): [number, number] | null => {
  if (!hasVpnPoint.value || !props.vpnLocation) return null;
  return props.vpnLocation;
});

const clientLngLat = computed((): [number, number] | null => {
  if (!hasClientPoint.value || !props.clientLocation) return null;
  return props.clientLocation;
});

const mapCenterAndZoom = computed(() => {
  const v = vpnLngLat.value;
  const u = clientLngLat.value;
  if (v && u) {
    const [vlon, vlat] = v;
    const [ulon, ulat] = u;
    return {
      center: [(vlon + ulon) / 2, (vlat + ulat) / 2] as [number, number],
      zoom: 2.2,
    };
  }
  if (v) return { center: v, zoom: 4 };
  if (u) return { center: u, zoom: 4 };
  return { center: [120.5, 24.0] as [number, number], zoom: 1.15 };
});

const prefersReducedMotion = ref(
  typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);

onMounted(() => {
  echarts.registerMap("world", worldMapData as any);
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion.value = mql.matches;
  const onMqlChange = () => {
    prefersReducedMotion.value = mql.matches;
  };
  mql.addEventListener("change", onMqlChange);
  onUnmounted(() => mql.removeEventListener("change", onMqlChange));
});

function formatCoordPair(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

const option = computed(() => {
  const v = vpnLngLat.value;
  const u = clientLngLat.value;
  const { center, zoom } = mapCenterAndZoom.value;

  const vpnMarker = v ? [{ name: "VPN", value: v as [number, number] }] : [];
  const clientMarker = u ? [{ name: "You", value: u as [number, number] }] : [];

  const lineData =
    v && u
      ? [
          {
            coords: [u, v] as [[number, number], [number, number]],
          },
        ]
      : [];

  const vpnPinSize = 22;
  const vpnRippleSize = 14;
  const clientDiamondSize = 20;

  const pointLabel = {
    show: true,
    position: "top" as const,
    distance: 6,
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: 600,
    formatter: "{b}",
    textBorderColor: "rgba(0,0,0,0.65)",
    textBorderWidth: 2,
  };

  const series: object[] = [];

  if (lineData.length > 0) {
    series.push({
      type: "lines",
      coordinateSystem: "geo",
      zlevel: 1,
      data: lineData,
      lineStyle: {
        color: "#71717a",
        width: 1.5,
        opacity: 0.75,
      },
      silent: true,
    });
  }

  if (clientMarker.length > 0) {
    series.push({
      type: "scatter",
      coordinateSystem: "geo",
      data: clientMarker,
      symbol: "diamond",
      symbolSize: clientDiamondSize,
      label: pointLabel,
      itemStyle: {
        color: "rgba(56, 189, 248, 0.92)",
        borderColor: "#e0f2fe",
        borderWidth: 2,
        shadowBlur: 12,
        shadowColor: "rgba(14, 165, 233, 0.55)",
      },
      emphasis: {
        scale: 1.12,
        itemStyle: {
          borderWidth: 2,
          shadowBlur: 18,
        },
      },
      zlevel: 5,
    });
  }

  if (vpnMarker.length > 0) {
    series.push({
      type: "scatter",
      coordinateSystem: "geo",
      data: vpnMarker,
      symbol: "pin",
      symbolSize: vpnPinSize,
      label: { ...pointLabel, color: "#fef3c7" },
      itemStyle: {
        color: "#f59e0b",
        borderColor: "#fde68a",
        borderWidth: 1,
        shadowBlur: 16,
        shadowColor: "rgba(245, 158, 11, 0.65)",
      },
      emphasis: {
        scale: 1.08,
      },
      zlevel: 2,
    });
    if (!prefersReducedMotion.value) {
      series.push({
        type: "effectScatter",
        coordinateSystem: "geo",
        data: vpnMarker,
        symbol: "pin",
        symbolSize: vpnRippleSize,
        showEffectOn: "render",
        rippleEffect: {
          brushType: "stroke",
          scale: 4.2,
          period: 3.5,
        },
        itemStyle: {
          color: "#fbbf24",
          opacity: 0.95,
          shadowBlur: 18,
          shadowColor: "#fbbf24",
        },
        zlevel: 3,
      });
    }
  }

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(24, 24, 27, 0.92)",
      borderColor: "#3f3f46",
      textStyle: { color: "#e4e4e7", fontSize: 12 },
      formatter: (p: {
        data?: { name?: string; value?: [number, number] };
      }) => {
        const d = p.data;
        if (!d?.value) return "";
        const [lng, lat] = d.value;
        return `${d.name ?? ""}<br/>${formatCoordPair(lat, lng)}`;
      },
    },
    geo: {
      map: "world",
      roam: true,
      center,
      zoom,
      scaleLimit: { min: 1, max: 220 },
      itemStyle: {
        areaColor: "#3f3f46",
        borderColor: "#71717a",
        borderWidth: 1.2,
      },
      emphasis: {
        disabled: false,
        itemStyle: { areaColor: "#52525b" },
      },
      select: { disabled: true },
    },
    series,
  };
});
</script>

<template>
  <div
    class="w-full min-h-[200px] h-[min(30vh,320px)] max-h-[320px] relative overflow-hidden flex flex-col rounded-lg border border-zinc-800 bg-zinc-950"
  >
    <div
      class="absolute top-0 left-0 right-0 z-10 px-4 py-2.5 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm"
    >
      <span
        class="text-xs font-semibold uppercase tracking-wider text-zinc-500"
        >Route preview</span
      >
      <span
        v-if="hasVpnPoint"
        class="text-xs text-zinc-500 truncate max-w-[55%]"
      >
        Game server appears after traffic is detected
      </span>
      <span
        v-else-if="clientGeoError"
        class="text-xs text-amber-600/90 truncate max-w-[55%]"
        :title="clientGeoError"
      >
        Location hint unavailable
      </span>
    </div>

    <div class="flex-1 min-h-0 pt-10 relative">
      <VChart
        class="w-full h-full"
        :option="option"
        :update-options="{ replaceMerge: ['series'] }"
        autoresize
      />

      <div
        v-if="clientGeoLoading && !hasClientPoint"
        class="absolute inset-0 top-10 flex flex-col items-center justify-center gap-2 pointer-events-none px-6 text-center"
      >
        <p class="text-sm text-zinc-400">Resolving your approximate location…</p>
      </div>

      <div
        v-else-if="!hasVpnPoint && !hasClientPoint"
        class="absolute inset-0 top-10 flex flex-col items-center justify-center gap-2 pointer-events-none px-6 text-center"
      >
        <p class="text-sm text-zinc-400">
          Select a VPN server to see its location on the map.
        </p>
        <p v-if="clientGeoError" class="text-xs text-amber-600/90">
          {{ clientGeoError }}
        </p>
      </div>

      <div
        v-else-if="!hasVpnPoint && hasClientPoint"
        class="absolute inset-0 top-10 flex flex-col items-center justify-center gap-2 pointer-events-none px-6 text-center"
      >
        <p class="text-sm text-zinc-400">
          Select a VPN server to see the full route.
        </p>
      </div>

      <div
        v-if="
          (hasVpnPoint && vpnLocation) || (hasClientPoint && clientLocation)
        "
        class="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none"
      >
        <div
          class="flex flex-col gap-2 min-w-0 sm:flex-row sm:items-end sm:gap-3"
        >
          <div
            v-if="hasClientPoint && clientLocation"
            class="pointer-events-auto flex items-center gap-2 bg-black/55 backdrop-blur-sm px-3 py-2 rounded-md border border-sky-500/30"
          >
            <div class="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
            <div class="text-left min-w-0">
              <div
                class="text-xs font-bold uppercase tracking-wide text-sky-400/90"
              >
                You (approx.)
              </div>
              <div class="text-xs text-zinc-300 font-mono truncate">
                {{ formatCoordPair(clientLocation[1], clientLocation[0]) }}
              </div>
              <div
                v-if="clientLabel"
                class="text-xs text-zinc-500 truncate"
              >
                {{ clientLabel }}
              </div>
            </div>
          </div>
          <div
            v-if="hasVpnPoint && vpnLocation"
            class="pointer-events-auto flex items-center gap-2 bg-black/55 backdrop-blur-sm px-3 py-2 rounded-md border border-amber-500/25"
          >
            <div class="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <div class="text-left min-w-0">
              <div
                class="text-xs font-bold uppercase tracking-wide text-amber-400/90"
              >
                VPN node
              </div>
              <div class="text-xs text-zinc-300 font-mono truncate">
                {{ formatCoordPair(vpnLocation[1], vpnLocation[0]) }}
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="regionLabel && hasVpnPoint"
          class="text-xs text-zinc-500 font-medium truncate max-w-[40%] text-right self-end"
        >
          {{ regionLabel }}
        </div>
      </div>
    </div>
  </div>
</template>
