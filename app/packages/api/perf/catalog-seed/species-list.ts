// Dev seed list: common houseplants. Names and families are botanical common knowledge. Difficulty and light need are
// not in the list: without a source they stay unknown, also in demo data (P-08, #1003).
// Table columns: latin | german | english | family (latin) | family (german)
export type SeedRow = readonly [string, string, string, string, string];

const TABLE = [
  "Monstera deliciosa|Fensterblatt|Swiss cheese plant|Araceae|Aronstabgewächse",
  "Epipremnum aureum|Efeutute|Golden pothos|Araceae|Aronstabgewächse",
  "Philodendron hederaceum|Herzblatt-Philodendron|Heartleaf philodendron|Araceae|Aronstabgewächse",
  "Spathiphyllum wallisii|Einblatt|Peace lily|Araceae|Aronstabgewächse",
  "Zamioculcas zamiifolia|Glücksfeder|ZZ plant|Araceae|Aronstabgewächse",
  "Aglaonema commutatum|Kolbenfaden|Chinese evergreen|Araceae|Aronstabgewächse",
  "Anthurium andraeanum|Flamingoblume|Flamingo flower|Araceae|Aronstabgewächse",
  "Alocasia amazonica|Pfeilblatt|African mask plant|Araceae|Aronstabgewächse",
  "Dieffenbachia seguine|Dieffenbachie|Dumb cane|Araceae|Aronstabgewächse",
  "Syngonium podophyllum|Purpurtute|Arrowhead vine|Araceae|Aronstabgewächse",
  "Sansevieria trifasciata|Bogenhanf|Snake plant|Asparagaceae|Spargelgewächse",
  "Chlorophytum comosum|Grünlilie|Spider plant|Asparagaceae|Spargelgewächse",
  "Dracaena fragrans|Drachenbaum|Corn plant|Asparagaceae|Spargelgewächse",
  "Yucca elephantipes|Palmlilie|Spineless yucca|Asparagaceae|Spargelgewächse",
  "Aloe vera|Echte Aloe|Aloe vera|Asphodelaceae|Affodillgewächse",
  "Haworthiopsis attenuata|Zebra-Haworthie|Zebra plant|Asphodelaceae|Affodillgewächse",
  "Crassula ovata|Geldbaum|Jade plant|Crassulaceae|Dickblattgewächse",
  "Echeveria elegans|Echeverie|Mexican snowball|Crassulaceae|Dickblattgewächse",
  "Kalanchoe blossfeldiana|Flammendes Käthchen|Flaming Katy|Crassulaceae|Dickblattgewächse",
  "Sedum morganianum|Eselsschwanz|Burro's tail|Crassulaceae|Dickblattgewächse",
  "Ficus elastica|Gummibaum|Rubber plant|Moraceae|Maulbeergewächse",
  "Ficus lyrata|Geigenfeige|Fiddle-leaf fig|Moraceae|Maulbeergewächse",
  "Ficus benjamina|Birkenfeige|Weeping fig|Moraceae|Maulbeergewächse",
  "Schefflera arboricola|Strahlenaralie|Dwarf umbrella tree|Araliaceae|Araliengewächse",
  "Hedera helix|Gewöhnlicher Efeu|English ivy|Araliaceae|Araliengewächse",
  "Fatsia japonica|Zimmeraralie|Japanese aralia|Araliaceae|Araliengewächse",
  "Pilea peperomioides|Ufopflanze|Chinese money plant|Urticaceae|Brennnesselgewächse",
  "Peperomia obtusifolia|Zwergpfeffer|Baby rubber plant|Piperaceae|Pfeffergewächse",
  "Calathea orbifolia|Korbmarante|Calathea orbifolia|Marantaceae|Pfeilwurzgewächse",
  "Maranta leuconeura|Gebetspflanze|Prayer plant|Marantaceae|Pfeilwurzgewächse",
  "Ctenanthe burle-marxii|Kammmarante|Fishbone prayer plant|Marantaceae|Pfeilwurzgewächse",
  "Nephrolepis exaltata|Schwertfarn|Boston fern|Lomariopsidaceae|Schwertfarngewächse",
  "Asplenium nidus|Nestfarn|Bird's nest fern|Aspleniaceae|Streifenfarngewächse",
  "Adiantum raddianum|Frauenhaarfarn|Delta maidenhair fern|Pteridaceae|Saumfarngewächse",
  "Platycerium bifurcatum|Geweihfarn|Staghorn fern|Polypodiaceae|Tüpfelfarngewächse",
  "Phalaenopsis amabilis|Schmetterlingsorchidee|Moth orchid|Orchidaceae|Orchideengewächse",
  "Paphiopedilum insigne|Frauenschuh|Lady's slipper orchid|Orchidaceae|Orchideengewächse",
  "Tillandsia ionantha|Luftnelke|Sky plant|Bromeliaceae|Ananasgewächse",
  "Guzmania lingulata|Guzmanie|Scarlet star|Bromeliaceae|Ananasgewächse",
  "Beaucarnea recurvata|Elefantenfuß|Ponytail palm|Asparagaceae|Spargelgewächse",
  "Chamaedorea elegans|Bergpalme|Parlor palm|Arecaceae|Palmengewächse",
  "Howea forsteriana|Kentiapalme|Kentia palm|Arecaceae|Palmengewächse",
  "Cycas revoluta|Palmfarn|Sago palm|Cycadaceae|Palmfarngewächse",
  "Hoya carnosa|Porzellanblume|Wax plant|Apocynaceae|Hundsgiftgewächse",
  "Ceropegia woodii|Leuchterblume|String of hearts|Apocynaceae|Hundsgiftgewächse",
  "Tradescantia zebrina|Dreimasterblume|Inch plant|Commelinaceae|Commelinagewächse",
  "Begonia maculata|Tropfenbegonie|Polka dot begonia|Begoniaceae|Schiefblattgewächse",
  "Saintpaulia ionantha|Usambaraveilchen|African violet|Gesneriaceae|Gesneriengewächse",
  "Codiaeum variegatum|Wunderstrauch|Croton|Euphorbiaceae|Wolfsmilchgewächse",
  "Euphorbia trigona|Dreikantige Wolfsmilch|African milk tree|Euphorbiaceae|Wolfsmilchgewächse",
  "Citrus limon|Zitronenbaum|Lemon tree|Rutaceae|Rautengewächse",
];

export const SEED_SPECIES: readonly SeedRow[] = TABLE.map((line) => {
  const [latin, german, english, familyLatin, familyGerman] = line.split("|");
  return [latin ?? "", german ?? "", english ?? "", familyLatin ?? "", familyGerman ?? ""];
});
