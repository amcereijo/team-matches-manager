import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  head: { height: 40, backgroundColor: '#f1f8ff' },
  text: { margin: 6 },
  matchRow: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 10,
    marginVertical: 5,
    backgroundColor: '#fff',
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
    elevation: 2,
  },
  matchTeamText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  matchTeamNoDateText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: 'red',
  },
  maatchButton: {
    alignSelf: 'flex-end',
  },
  sendWhatsButton: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    // backgroundColor: '#007bff',
    backgroundColor: 'green',
    color: '#fff',
    borderWidth: 0,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center'
  },
  loadingText: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  noMatchesText: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
});

export default styles;
