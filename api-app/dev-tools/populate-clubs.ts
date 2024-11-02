import sqlite from 'sqlite3';
import 'reflect-metadata';
import { connectDatabase } from '../src/config/db';
import { Club } from "../src/models/club.entity";
import * as fs from 'fs';

const database = process.env.DATA_BASE || './team-matches.sql';

const populateClubs = async () => {
  try {
    console.log('Attempting to connect to database...');
    const connection = await connectDatabase(database);
    console.log('Connected to database successfully');

    const clubRepository = connection.getRepository(Club);

    for (const clubData of CLUBS) {
      const club = new Club(clubData.code, clubData.name);
      await clubRepository.save(club);
    }

    console.log("Clubs populated successfully");

    const clubs = await clubRepository.find();
    console.log(clubs)

    await connection.destroy();
  } catch (error) {
    console.error("Error populating clubs:", error);
    console.error("Error stack:", error.stack);
  }
};

populateClubs();

export const CLUBS = [
	// {code: 0, name: "Filtro Club ..."},

	{code: 332, name: "ALCALA PA"},
	{code: 454, name: "50 PROJECT EP"},
	{code: 462, name: "ADITE PA"},
	{code: 386, name: "ALAMEDA OSUNA HP"},
	{code: 503, name: "ALBACETE H.C."},
	{code: 423, name: "ALCALA HP"},
	{code: 399, name: "ALCOBENDAS HP"},
	{code: 328, name: "ALCOBENDAS PA"},
	{code: 398, name: "ALDOVEA HP"},
	{code: 488, name: "ALOHA PA"},
	{code: 393, name: "ALUCHE HP"},
	{code: 331, name: "ALUCHE PA"},
	{code: 358, name: "ARANJUEZ PA"},
	{code: 368, name: "ARGANDA PV"},
	{code: 341, name: "ARTISTICO LAS ROZAS PA"},
	{code: 460, name: "ARTIUM PA"},
	{code: 431, name: "ASOC. PATIN LINEA ALCALA HL"},
	{code: 440, name: "AVILA"},
	{code: 499, name: "BECERRIL"},
	{code: 345, name: "BERNABELLA PA"},
	{code: 360, name: "BERNADETTE PA"},
	{code: 389, name: "BLACK THUNDERS RD"},
	{code: 457, name: "BOADILLA DEL MONTE H.P."},
	{code: 455, name: "BOADILLA DEL MONTE PA"},
	{code: 403, name: "BOADILLA PATINA HL-PAL-FS-PV"},
	{code: 382, name: "BREZO OSUNA PA"},
	{code: 505, name: "BURDINOLA"},
	{code: 441, name: "BURGUILLOS"},
	{code: 507, name: "CALVIA HC"},
	{code: 434, name: "CASAR HP"},
	{code: 361, name: "CASTILLA PA"},
	{code: 477, name: "CEM INLINE"},
	{code: 426, name: "CIUDAD PATINA HL"},
	{code: 320, name: "CLUB DE CAMPO VILLA DE MADRID PA"},
	{code: 492, name: "COCENTAINA"},
	{code: 357, name: "COLMENAR VIEJO PA"},
	{code: 333, name: "COSLADA PA Y HP"},
	{code: 448, name: "CP ALCODIAM"},
	{code: 449, name: "CP CAJAR"},
	{code: 450, name: "CP IRLANDESAS"},
	{code: 496, name: "CPL GALAPAGAR NORK VIKINGS"},
	{code: 451, name: "CPP RASPEIG"},
	{code: 355, name: "DAGANZO PA"},
	{code: 446, name: "DEL PATIN EP"},
	{code: 469, name: "DOCTOR PATIN HP"},
	{code: 356, name: "DOCTOR PATIN PA-PAL"},
	{code: 344, name: "EL MEJOR PATIN PA"},
	{code: 484, name: "EL VALLE"},
	{code: 453, name: "ENLINEA PATINA FS"},
	{code: 497, name: "ENTABLA SK"},
	{code: 475, name: "FAST ROLLER MADRID PV"},
	{code: 330, name: "FMP"},
	{code: 481, name: "FREESTYLE MADRID"},
	{code: 493, name: "FUENGIROLA"},
	{code: 346, name: "FUENLABRADA PA Y FS"},
	{code: 506, name: "FUENLABRADA ROLLER DERBY"},
	{code: 459, name: "GIROS PA"},
	{code: 425, name: "GREDOS SAN DIEGO HP"},
	{code: 326, name: "GREDOS SAN DIEGO PA"},
	{code: 396, name: "H.P. MAJADAHONDA HP"},
	{code: 395, name: "HOCKEY RIVAS LAS LAGUNAS HP"},
	{code: 438, name: "IMPULSO URBANO HL"},
	{code: 372, name: "IN-GRAVITY PV-FS"},
	{code: 463, name: "INLINE MADRID FS-PV-EP-RF"},
	{code: 466, name: "IWIAS F&amp;A EP"},
	{code: 366, name: "LA DEHESA PA"},
	{code: 352, name: "LA VIDA SOBRE RUEDAS PA-PAL"},
	{code: 420, name: "LAS ROZAS HL"},
	{code: 400, name: "LAS ROZAS HP"},
	{code: 429, name: "LOBOS CASTILLA HL"},
	{code: 504, name: "MAD RAMPS"},
	{code: 349, name: "MADRID SOMONTES PA"},
	{code: 433, name: "MADRIDERS"},
	{code: 375, name: "MADRIDPATINA"},
	{code: 338, name: "MAJADAHONDA PA"},
	{code: 412, name: "MAMUTS HOCKEY"},
	{code: 461, name: "MDLS - MIRAFLORES PA"},
	{code: 436, name: "MIL RUEDAS PA"},
	{code: 491, name: "MOLINA SPORT"},
	{code: 342, name: "MORATALAZ PA"},
	{code: 359, name: "MOSTOLES 08 PA"},
	{code: 335, name: "MOSTOLES PA"},
	{code: 343, name: "NERON PA"},
	{code: 476, name: "ONSKATES FS"},
	{code: 413, name: "PARLA EP"},
	{code: 334, name: "PATIN ALCORCON HP Y PA"},
	{code: 371, name: "PATIN DE ORO"},
	{code: 473, name: "PATIN PARQUE LISBOA PA Y EP"},
	{code: 362, name: "PATIN TEJAR DE SOMONTES"},
	{code: 354, name: "PATINA LAS ROZAS FS-PAL"},
	{code: 489, name: "PATINAJE AL3"},
	{code: 480, name: "PATINAJE FLIP PA"},
	{code: 406, name: "PATINAJE LINEA MADRID"},
	{code: 465, name: "PEDREZUELA"},
	{code: 421, name: "PINGUINOS"},
	{code: 410, name: "PUMAS DEL NORTE PAL-HL"},
	{code: 397, name: "RETAMAR"},
	{code: 464, name: "ROLLART SANSE PA"},
	{code: 479, name: "ROLLER CENTER PA Y FS"},
	{code: 388, name: "ROLLER DERBY MADRID"},
	{code: 445, name: "ROLLER STYLE FS"},
	{code: 444, name: "ROLLER'S STARS PAL-PA"},
	{code: 414, name: "ROLLERGREEN"},
	{code: 502, name: "ROLLERMANIACOS"},
	{code: 418, name: "ROLLING NORTE EP"},
	{code: 495, name: "ROLLYBEARS PARLA HL"},
	{code: 351, name: "ROULEMENT"},
	{code: 483, name: "RUEDA MADRID"},
	{code: 474, name: "SALAMANCA H.C."},
	{code: 427, name: "SAMURAI HL-PA-EP"},
	{code: 365, name: "SAN AGUSTIN"},
	{code: 472, name: "SAN FERNANDO HENARES PA"},
	{code: 470, name: "SANSE HOCKEY HP"},
	{code: 486, name: "SILVER PA"},
	{code: 500, name: "SKATE POZUELO"},
	{code: 501, name: "SKATEFUN"},
	{code: 384, name: "SLIDERS"},
	{code: 376, name: "SOBRE8RUEDAS"},
	{code: 383, name: "SOBRERUEDAMADRID"},
	{code: 402, name: "SPEED WHEELS"},
	{code: 374, name: "SPORTING DE VALLECAS FS-PAL"},
	{code: 329, name: "STA. Mª DEL PILAR HP Y PA"},
	{code: 428, name: "STA. Mª LA BLANCA"},
	{code: 407, name: "TIGRES DE ARANJUEZ"},
	{code: 411, name: "TISO PATIN"},
	{code: 353, name: "TORRELODONES"},
	{code: 387, name: "TRES CANTOS HL"},
	{code: 424, name: "TRES CANTOS HP"},
	{code: 347, name: "TRES CANTOS P.A."},
	{code: 373, name: "TRES60"},
	{code: 490, name: "TROYANOS VILLARROBLEDO"},
	{code: 498, name: "TROYANOS VILLARROBLEDO"},
	{code: 458, name: "TRS MADRID"},
	{code: 494, name: "UNIQUE PA"},
	{code: 340, name: "UP RIVAS"},
	{code: 485, name: "VALENTIA HP"},
	{code: 339, name: "VALLEHERMOSO"},
	{code: 370, name: "VALLEKAS"},
	{code: 508, name: "VALLMONT PA"},
	{code: 337, name: "VELILLA"},
	{code: 378, name: "VELOCIDAD RIVAS PV-FS-EP"},
	{code: 437, name: "VETTONIA"},
	{code: 322, name: "VILLANUEVA DEL PARDILLO"},
	{code: 435, name: "VILLANUEVA PATINA EP"},
	{code: 394, name: "VIRGEN DE EUROPA"}
];


// import sqlite from 'sqlite3';
// // Create a connection to an in-memory database
// const db = new sqlite.Database(database);
// // const db = new sqlite.Database(':memory:');

// // Database operations
// db.serialize(async () => {
//     // Create a table
//     db.run("CREATE TABLE clubs (code INTEGER PRIMARY KEY, name TEXT)");

//     // Insert data into the table
//     const stmt = db.prepare("INSERT INTO clubs (code, name) VALUES (?, ?)");
//     // for (let i = 0; i < 10; i++) {
//     //     stmt.run("Ipsum " + i);
//     // }
//     for (const clubData of CLUBS) {
//       // const club = new Club(clubData.code, clubData.name);
//       stmt.run(clubData.code, clubData.name);
//     }
//     stmt.finalize();

//     console.log('Done');

//     // Query data from the table
//     db.each("SELECT * FROM clubs", (err, row) => {
//         console.log(row);
//     });
// });

// // Close the connection when you're done
// db.close();


