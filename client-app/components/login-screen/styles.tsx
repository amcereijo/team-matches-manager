import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingLeft: 8,
  },
  picker: {
    // height: 40,
    // borderColor: 'gray',
    // borderWidth: 1,
    // marginBottom: 10,
    // paddingLeft: 8,

    paddingLeft: 10,
    width: 200,
  },
  checkboxContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
});

export default styles;
