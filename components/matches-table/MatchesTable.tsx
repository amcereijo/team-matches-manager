import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { Table } from 'react-native-table-component';
import { Game, getMatches } from '../../services/fmp';
import styles from './styles';
import { TouchableOpacity } from 'react-native-gesture-handler';
import whats48 from '../../assets/icons8-whatsapp-48.png';
import { openWhatsapp } from '../../services/whatsapp';
import { getClubCode } from '../../services/team';

/**
 * Return date in forma DDD, DD/MM/YYYY
 * @param date: string
 * @returns
 */
const formatDate = (date?: string, time?: string) => {
  if (!date || !time) return '';

  const [day, month, year] = date.split('/');
  const [hour, minute] = time.split(':');
  const stringDate = `${year}-${month}-${day}T${hour}:${minute}:00`;

  const dateObj = new Date(stringDate);

  if (isNaN(dateObj.getTime())) {
    console.error('Invalid date');
    return '';
  }

  const options: Intl.DateTimeFormatOptions = { weekday: 'long', hour: '2-digit', minute: '2-digit', month: 'long', day: '2-digit' };
  return dateObj.toLocaleDateString('es-ES', options);
}

  const CustomRow = ({ index, data }: { index: number; data: Game}) => (
    <View
        style={index % 2 === 0 ? { ...styles.matchRow, backgroundColor: '#F7F6E7' } : styles.matchRow}>

      <Text style={styles.matchTeamText}>{`${data.league} - ${formatDate(data.date!, data.time!)}`}</Text>
      <Text>{`${data.local} vs ${data.visit}`}</Text>
      <Text>{`Pista: ${data.location}`}</Text>
      <TouchableOpacity
        style={styles.sendWhatsButton}
        onPress={async () => {
          await openWhatsapp(data);
        }}>
        <Image alt='Enviar por whatsapp' source={whats48} style={{ width: 24, height: 24 }} />
        <Text style={{ color: 'white', marginLeft: 2 }}>Enviar</Text>
      </TouchableOpacity>
    </View>
  );

const Loading = () => (
  <View style={styles.noMatchesText}>
    <ActivityIndicator size="large" color="#0000ff" />
    <Text>Cargando pórximos partidos...</Text>
  </View>
);

const NoMatches = () => (
  <View style={styles.noMatchesText}>
    <Text>No hay próximos partidos</Text>
  </View>
);

const MatchesTable = () => {
  const [games, setGames] = useState<Game[] | null>(null);

  useEffect(() => {
    const setMatches = async () => {
      const clubCode = await getClubCode();
      if (!games) {
        getMatches(clubCode)
          .then(data => setGames(data))
          .catch(error => console.error(error));
      }
    };
    setMatches();
  }, []);

  return (
    <ScrollView>
      {!games && <Loading/>}
      {games && games.length === 0 && <NoMatches/>}
      {games && games.length > 0 && (
        <Table>
          {games.map((rowData, index) => (
            <CustomRow key={index} index={index} data={rowData} />
          ))}
        </Table>
      )}

    </ScrollView>
  );
};

export default MatchesTable;
