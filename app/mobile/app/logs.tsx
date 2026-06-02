import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

import { LogList } from '@/components/LogList';

export default function LogsScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Logs',
          // Reached from the Settings tab, so show "Settings" as the back label
          // instead of the (tabs) group's title ("Plugins").
          headerBackTitle: 'Settings',
          headerStyle: { backgroundColor: '#243f5f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
      <LogList style={styles.list} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  list: {
    flex: 1,
  },
});
